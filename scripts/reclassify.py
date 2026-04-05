#!/usr/bin/env python3
"""
IPC 批次重分類標記工具

根據 WIPO IPC concordance 資料，標記專利的 IPC 代碼是否涉及版本異動，
並依處理難度分為三級：自動替換、需判斷（廢棄多目的地）、需確認（技術範圍移動）。

用法:
    python3 scripts/reclassify.py input.xlsx -c IPC
    python3 scripts/reclassify.py data.csv -c "分類號" -o output.csv --verbose
    python3 scripts/reclassify.py input.tsv -c IPC --self-test
"""

from __future__ import annotations
import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

# ── IPC 代碼解析 ─────────────────────────────────────────────

_IPC_RE = re.compile(r'^([A-H]\d{2}[A-Z])(?:\s*(\d+)/(\S+))?$')


def parse_ipc_code(code: str) -> dict | None:
    """拆解 IPC 代碼為 subclass / main_group / subgroup。

    支援多種格式：
    >>> parse_ipc_code('H01L 21/677')
    {'subclass': 'H01L', 'main': 21, 'sub': '677', 'group': 'H01L 21/677'}
    >>> parse_ipc_code('H01L21/677')     # 無空格
    {'subclass': 'H01L', 'main': 21, 'sub': '677', 'group': 'H01L 21/677'}
    >>> parse_ipc_code('H01L 21/677(2006.01)')  # 附版本標記
    {'subclass': 'H01L', 'main': 21, 'sub': '677', 'group': 'H01L 21/677'}
    >>> parse_ipc_code('H01L')
    {'subclass': 'H01L', 'main': None, 'sub': None, 'group': None}
    """
    code = code.strip().upper().replace('\n', ' ')
    code = re.sub(r'\s+', ' ', code)
    # Remove version/date suffix: (2006.01), [2006.01], (20060101)
    code = re.sub(r'[\(\[]\d{4}[\.\-]?\d{0,2}[\)\]]?$', '', code).strip()
    # Remove leading class indicator like "I:" or "N:" (TIPO format)
    code = re.sub(r'^[A-Z]:\s*', '', code)
    # Handle no-space format: "H01L21/677" → "H01L 21/677"
    m2 = re.match(r'^([A-H]\d{2}[A-Z])(\d+/\S+)$', code)
    if m2:
        code = f"{m2.group(1)} {m2.group(2)}"
    m = _IPC_RE.match(code)
    if not m:
        return None
    subclass, main, sub = m.group(1), m.group(2), m.group(3)
    if main is not None:
        return {
            'subclass': subclass,
            'main': int(main),
            'sub': sub,
            'group': f"{subclass} {main}/{sub}",
        }
    return {'subclass': subclass, 'main': None, 'sub': None, 'group': None}


def parse_ipc_field(value) -> list[str]:
    """將 IPC 欄位字串拆成清單。

    支援多種分隔格式：
      逗號: "H01L 21/677, G06F 3/01"
      分號: "H01L 21/677; G06F 3/01"
      換行: "H01L 21/677\\nG06F 3/01"
      空格+subclass: "H01L 21/677 G06F 3/01"（兩個代碼間無分隔符）
      TIPO pipe: "H01L 21/677|G06F 3/01"
    """
    if not value or (isinstance(value, float) and str(value) == 'nan'):
        return []
    raw = str(value).strip()
    if not raw:
        return []
    # Split by common delimiters
    parts = re.split(r'[,;|\n\r]+', raw)
    # Handle space-separated codes: "H01L 21/677 G06F 3/01"
    # Split further if a part contains two IPC codes
    result = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        # Check if part contains multiple codes (e.g., "H01L 21/677 G06F 3/01")
        codes = re.findall(r'[A-H]\d{2}[A-Z]\s*\d+/\S+', part.upper())
        if len(codes) > 1:
            result.extend(c.strip() for c in codes)
        elif codes:
            result.append(codes[0].strip())
        else:
            # Might be subclass-only: "H01L"
            sub = re.match(r'^[A-H]\d{2}[A-Z]$', part.strip().upper())
            if sub:
                result.append(sub.group())
    return result


# ── 核心分類器 ───────────────────────────────────────────────

class IPCReclassifier:
    """IPC 重分類標記引擎。

    三級處理：
      Level 1 (auto_replaced)    : 廢棄 subclass，單一目的地 → 自動替換
      Level 2 (review_deprecated): 廢棄 subclass，多個目的地 → 列出候選
      Level 3 (review_scope)     : group 級技術範圍移動 → 標記可能需移動
    """

    def __init__(self, data_path: str | Path | None = None):
        if data_path is None:
            data_path = Path(__file__).resolve().parent.parent / 'public' / 'ipc_data.json'
        with open(data_path, encoding='utf-8') as f:
            data = json.load(f)

        self.deprecated_to = data.get('deprecated_to', {})
        self.deprecated_at = data.get('deprecated_at', {})
        self.subclass_index = data.get('subclass_index', {})

        # 分類廢棄 subclass：單一目的地 vs 多目的地
        self.deprecated_single = {}   # code → single destination
        self.deprecated_multi = {}    # code → list of destinations
        for old, new in self.deprecated_to.items():
            if isinstance(new, list):
                self.deprecated_multi[old] = new
            else:
                self.deprecated_single[old] = new

        # 建立 group 級查找索引
        self._build_exact_lookup()
        self._build_range_lookup()

        stats = (f"loaded: {len(self.deprecated_single)} auto-replace, "
                 f"{len(self.deprecated_multi)} multi-dest, "
                 f"{len(self.exact_lookup)} exact groups, "
                 f"{sum(len(v) for v in self.range_lookup.values())} ranges")
        self._stats = stats

    def _version_sort_key(self, version_str: str) -> str:
        """從 '1995.01→2000.01' 取得排序 key '2000.01'。"""
        if '→' in version_str:
            return version_str.split('→')[1].strip()
        return version_str

    def _build_exact_lookup(self):
        """建立 src_group → 最新版 dst 的精確查找表。"""
        # 先收集所有 donated 記錄
        all_donations = defaultdict(list)  # src_group → [(version_key, dst, version_str, src_sub)]
        for sub, info in self.subclass_index.items():
            for d in info.get('donated', []):
                src = d.get('src_group', '').replace('\n', ' ').strip()
                dst = d.get('dst', '')
                ver = d.get('version', '')
                if src and dst:
                    all_donations[src].append((self._version_sort_key(ver), dst, ver, sub))

        # 取每個 src_group 的最新版本
        self.exact_lookup = {}
        for src, records in all_donations.items():
            records.sort(key=lambda x: x[0], reverse=True)  # 最新版在前
            latest = records[0]
            self.exact_lookup[src] = {
                'dst': latest[1],
                'version': latest[2],
                'src_sub': latest[3],
            }

    def _build_range_lookup(self):
        """建立範圍查找表：subclass → [(start_main, start_sub, end_main, end_sub, info)]。"""
        self.range_lookup = defaultdict(list)  # subclass → list of range entries

        for src, info in self.exact_lookup.items():
            if ' - ' not in src:
                continue
            # Parse "H01L 21/335 - 21/338"
            parts = src.split(' - ')
            if len(parts) != 2:
                continue
            left = parts[0].strip()
            right = parts[1].strip()

            parsed_left = parse_ipc_code(left)
            if not parsed_left or parsed_left['main'] is None:
                continue

            sub = parsed_left['subclass']
            start_main = parsed_left['main']
            start_sub = parsed_left['sub']

            # Right side may omit subclass: "21/338" or "5/00"
            right_match = re.match(r'(\d+)/(\S+)', right)
            if not right_match:
                continue
            end_main = int(right_match.group(1))
            end_sub = right_match.group(2)

            self.range_lookup[sub].append({
                'start_main': start_main, 'start_sub': start_sub,
                'end_main': end_main, 'end_sub': end_sub,
                'dst': info['dst'], 'version': info['version'],
                'src_range': src,
            })

    def _extract_first_dst(self, dst_str: str, src_sub: str) -> str:
        """從 dst 字串提取第一個非自引用的目的地代碼。"""
        # Split by comma
        parts = [p.strip() for p in dst_str.split(',')]
        for part in parts:
            # Take the part before " - " (range notation)
            code = part.split(' - ')[0].strip()
            if not code:
                continue
            # Skip self-referencing (dst starts with same subclass as source)
            parsed = parse_ipc_code(code)
            if parsed and parsed['subclass'] == src_sub:
                continue
            return code
        # All self-referencing → return first one
        return parts[0].split(' - ')[0].strip() if parts else dst_str

    def _in_range(self, main: int, sub: str, r: dict) -> bool:
        """判斷 (main, sub) 是否在範圍 [start, end] 內。"""
        if main < r['start_main'] or main > r['end_main']:
            return False
        if main == r['start_main'] and main == r['end_main']:
            # 同一個 main group，比較 subgroup
            return r['start_sub'] <= sub <= r['end_sub']
        if main == r['start_main']:
            return sub >= r['start_sub']
        if main == r['end_main']:
            return sub <= r['end_sub']
        return True  # main is strictly between start and end

    def classify_code(self, code: str) -> dict:
        """對單一 IPC 代碼進行重分類標記。

        Returns dict with keys:
            action: 'unchanged' | 'auto_replaced' | 'review_deprecated' | 'review_scope'
            original: 原始代碼
            result: 替換後代碼（僅 auto_replaced）
            candidates: 可能目的地列表（review_deprecated）
            possible_new: 可能的新位置（review_scope）
            detail: 說明文字
        """
        code = code.strip().upper().replace('\n', ' ')
        code = re.sub(r'\s+', ' ', code)
        parsed = parse_ipc_code(code)

        if not parsed:
            return {'action': 'unchanged', 'original': code, 'detail': '無法解析'}

        sub = parsed['subclass']
        result = {'action': 'unchanged', 'original': code, 'detail': ''}

        # ── Level 1: 廢棄 subclass，單一目的地 → 自動替換 ──
        if sub in self.deprecated_single:
            new_sub = self.deprecated_single[sub]
            at = self.deprecated_at.get(sub, '?')
            if parsed['group']:
                new_code = parsed['group'].replace(sub, new_sub, 1)
            else:
                new_code = new_sub
            return {
                'action': 'auto_replaced',
                'original': code,
                'result': new_code,
                'detail': f"{sub} 廢棄→{new_sub} ({at})",
            }

        # ── Level 2: 廢棄 subclass，多目的地 → 需判斷 ──
        if sub in self.deprecated_multi:
            dests = self.deprecated_multi[sub]
            at = self.deprecated_at.get(sub, '?')
            return {
                'action': 'review_deprecated',
                'original': code,
                'candidates': ', '.join(dests),
                'detail': f"{sub} 廢棄→{'/'.join(dests)} ({at})，需依專利內容判斷",
            }

        # ── Level 3: group 級精確匹配 ──
        if parsed['group']:
            group_key = parsed['group']
            # 3a: 精確匹配 src_group
            if group_key in self.exact_lookup:
                info = self.exact_lookup[group_key]
                dst = self._extract_first_dst(info['dst'], info['src_sub'])
                return {
                    'action': 'review_scope',
                    'original': code,
                    'possible_new': dst,
                    'detail': f"{group_key}→{dst} ({info['version']})，需確認專利是否屬於移出的技術範圍",
                }

            # 3b: 範圍匹配
            if sub in self.range_lookup and parsed['main'] is not None:
                for r in self.range_lookup[sub]:
                    if self._in_range(parsed['main'], parsed['sub'], r):
                        dst = self._extract_first_dst(r['dst'], sub)
                        return {
                            'action': 'review_scope',
                            'original': code,
                            'possible_new': dst,
                            'detail': f"{code} 在範圍 {r['src_range']} 內→{dst} ({r['version']})，需確認",
                        }

            # 3c: 主組匹配（xx/00）— 只標記，不建議具體目的地
            main_group = f"{sub} {parsed['main']}/00"
            if main_group in self.exact_lookup and main_group != group_key:
                info = self.exact_lookup[main_group]
                dst = self._extract_first_dst(info['dst'], info['src_sub'])
                return {
                    'action': 'review_scope',
                    'original': code,
                    'possible_new': dst,
                    'detail': f"主組 {main_group} 有異動→{dst} ({info['version']})，此子組可能受影響",
                }

        return result

    def classify_field(self, value) -> list[dict]:
        """處理多碼 IPC 欄位，逐一分類。"""
        codes = parse_ipc_field(value)
        if not codes:
            return [{'action': 'unchanged', 'original': str(value), 'detail': '空值或無效'}]
        return [self.classify_code(c) for c in codes]


# ── I/O ──────────────────────────────────────────────────────

def detect_format(filepath: Path) -> str:
    ext = filepath.suffix.lower()
    if ext == '.xlsx':
        return 'xlsx'
    if ext == '.tsv':
        return 'tsv'
    if ext == '.csv':
        return 'csv'
    # Auto-detect
    with open(filepath, encoding='utf-8') as f:
        first_line = f.readline()
        if '\t' in first_line:
            return 'tsv'
    return 'csv'


def read_input(filepath: Path, ipc_col: str, fmt: str) -> tuple[list[dict], list[str]]:
    """讀入資料，返回 (rows, headers)。"""
    if fmt == 'xlsx':
        try:
            import openpyxl
        except ImportError:
            print("錯誤：需要 openpyxl 套件來讀取 Excel 檔案", file=sys.stderr)
            print("安裝：pip install openpyxl", file=sys.stderr)
            sys.exit(1)
        wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        headers = [str(h or '') for h in next(rows_iter)]
        if ipc_col not in headers:
            print(f"錯誤：找不到欄位 '{ipc_col}'，可用欄位: {headers}", file=sys.stderr)
            sys.exit(1)
        rows = []
        for row in rows_iter:
            rows.append(dict(zip(headers, [str(v) if v is not None else '' for v in row])))
        wb.close()
        return rows, headers
    else:
        delimiter = '\t' if fmt == 'tsv' else ','
        with open(filepath, encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            headers = reader.fieldnames or []
            if ipc_col not in headers:
                print(f"錯誤：找不到欄位 '{ipc_col}'，可用欄位: {headers}", file=sys.stderr)
                sys.exit(1)
            rows = list(reader)
        return rows, headers


def write_output(filepath: Path, rows: list[dict], headers: list[str], fmt: str):
    """寫出結果。"""
    new_cols = ['reclassify_action', 'reclassify_result', 'reclassify_candidates', 'reclassify_detail']
    all_headers = headers + new_cols

    if fmt == 'xlsx':
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(all_headers)
        for row in rows:
            ws.append([row.get(h, '') for h in all_headers])
        wb.save(filepath)
    else:
        delimiter = '\t' if fmt == 'tsv' else ','
        with open(filepath, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=all_headers, delimiter=delimiter, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(rows)


def generate_summary(results_count: dict, total: int) -> str:
    """產生摘要報告。"""
    lines = [
        '=' * 50,
        'IPC 重分類標記報告',
        '=' * 50,
        f'總筆數: {total:,}',
        '',
    ]

    for action, label in [
        ('unchanged', '不需處理'),
        ('auto_replaced', '已自動替換（廢棄 subclass 單一目的地）'),
        ('review_deprecated', '需人工判斷（廢棄 subclass 多目的地）'),
        ('review_scope', '需確認（group 技術範圍移動，看專利內容）'),
        ('parse_error', '解析失敗'),
    ]:
        count = results_count.get(action, 0)
        pct = count / total * 100 if total > 0 else 0
        lines.append(f'  {action:<22} {count:>8,} ({pct:>5.1f}%) — {label}')

    return '\n'.join(lines)


# ── 自測 ─────────────────────────────────────────────────────

def self_test(rc: IPCReclassifier):
    """內建驗證：確認已知案例的分類結果正確。"""
    # Test parsing edge cases first
    print("  格式解析測試：")
    parse_tests = [
        ('H01L21/677', 'H01L', 21, '677'),           # 無空格
        ('H01L 21/677(2006.01)', 'H01L', 21, '677'),  # 附版本
        ('h01l 21/677', 'H01L', 21, '677'),           # 小寫
        ('I: H01L 21/677', 'H01L', 21, '677'),        # TIPO 前綴
    ]
    for raw, exp_sub, exp_main, exp_subg in parse_tests:
        p = parse_ipc_code(raw)
        ok = p and p['subclass'] == exp_sub and p['main'] == exp_main and p['sub'] == exp_subg
        print(f"    {'✅' if ok else '❌'} {raw:<28} → {p['group'] if p else 'FAIL'}")

    field_tests = [
        ('H01L 21/677, G06F 3/01', 2),
        ('H01L 21/677; G06F 3/01', 2),
        ('H01L 21/677|G06F 3/01', 2),
        ('H01L 21/677 G06F 3/01', 2),  # 空格分隔
    ]
    for raw, exp_count in field_tests:
        codes = parse_ipc_field(raw)
        ok = len(codes) == exp_count
        print(f"    {'✅' if ok else '❌'} field({raw[:30]}) → {len(codes)} codes")

    print("\n  分類邏輯測試：")
    tests = [
        # (input, expected_action, expected_key_value)
        ('C13C 3/02', 'auto_replaced', 'result', 'C13B 3/02'),
        ('C13D', 'auto_replaced', 'result', 'C13B'),
        ('G06C 15/00', 'auto_replaced', 'result', 'G06N 15/00'),
        ('F21H 3/00', 'auto_replaced', 'result', 'F21V 3/00'),
        ('F24J 2/00', 'review_deprecated', None, None),
        ('F21M 3/00', 'review_deprecated', None, None),
        ('H01L 21/00', 'review_scope', None, None),
        ('H01L 33/00', 'review_scope', None, None),
        ('A01B 1/00', 'unchanged', None, None),
        ('G06F 3/01', 'unchanged', None, None),
        # Format variants should also work
        ('C13C3/02', 'auto_replaced', 'result', 'C13B 3/02'),       # 無空格
        ('H01L 21/00(2006.01)', 'review_scope', None, None),        # 附版本
    ]

    passed = 0
    failed = 0
    for code, exp_action, exp_key, exp_val in tests:
        result = rc.classify_code(code)
        ok = result['action'] == exp_action
        if ok and exp_key and exp_val:
            ok = result.get(exp_key) == exp_val
        status = '✅' if ok else '❌'
        if ok:
            passed += 1
        else:
            failed += 1
        detail = result.get('result', result.get('candidates', result.get('possible_new', '')))
        print(f"  {status} {code:<16} → {result['action']:<20} {detail}")

    print(f"\n自測: {passed}/{passed + failed} 通過")
    return failed == 0


# ── 主程式 ───────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='IPC 批次重分類標記工具 — 標記專利 IPC 是否涉及版本異動',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''範例:
  python3 scripts/reclassify.py patents.xlsx -c IPC
  python3 scripts/reclassify.py data.csv -c "分類號" -o result.csv
  python3 scripts/reclassify.py --self-test
''')
    parser.add_argument('input', nargs='?', help='輸入檔案路徑 (xlsx/csv/tsv)')
    parser.add_argument('-c', '--ipc-col', default='IPC', help='IPC 欄位名稱 (預設: IPC)')
    parser.add_argument('-o', '--output', help='輸出檔案路徑 (預設: 輸入檔名加 _reclassified)')
    parser.add_argument('-v', '--verbose', action='store_true', help='顯示處理進度')
    parser.add_argument('--self-test', action='store_true', help='執行內建自測')
    parser.add_argument('--data', help='ipc_data.json 路徑 (預設: public/ipc_data.json)')
    args = parser.parse_args()

    # 初始化分類器
    data_path = args.data if args.data else None
    rc = IPCReclassifier(data_path)

    if args.self_test:
        print(f"IPCReclassifier {rc._stats}")
        print("\n執行自測...\n")
        ok = self_test(rc)
        sys.exit(0 if ok else 1)

    if not args.input:
        parser.print_help()
        sys.exit(1)

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"錯誤：找不到檔案 {input_path}", file=sys.stderr)
        sys.exit(1)

    fmt = detect_format(input_path)
    output_path = Path(args.output) if args.output else input_path.with_name(
        input_path.stem + '_reclassified' + input_path.suffix)

    print(f"讀取 {input_path} ({fmt})...")
    rows, headers = read_input(input_path, args.ipc_col, fmt)
    print(f"  {len(rows):,} 筆資料，IPC 欄位: {args.ipc_col}")

    # 處理每筆資料
    results_count = defaultdict(int)
    for i, row in enumerate(rows):
        ipc_value = row.get(args.ipc_col, '')
        classifications = rc.classify_field(ipc_value)

        # 取最重要的 action（優先顯示需處理的）
        actions = [c['action'] for c in classifications]
        if 'review_scope' in actions:
            primary_action = 'review_scope'
        elif 'review_deprecated' in actions:
            primary_action = 'review_deprecated'
        elif 'auto_replaced' in actions:
            primary_action = 'auto_replaced'
        else:
            primary_action = 'unchanged'

        # 建結果欄位
        row['reclassify_action'] = primary_action

        # result: 自動替換的結果（重組完整 IPC 欄位）
        replaced_codes = []
        for c in classifications:
            if c['action'] == 'auto_replaced':
                replaced_codes.append(c.get('result', c['original']))
            else:
                replaced_codes.append(c['original'])
        row['reclassify_result'] = '; '.join(replaced_codes) if 'auto_replaced' in actions else ''

        # candidates + detail
        candidates = [c.get('candidates', '') for c in classifications if c.get('candidates')]
        details = [c.get('detail', '') for c in classifications if c.get('detail')]
        possible = [c.get('possible_new', '') for c in classifications if c.get('possible_new')]

        row['reclassify_candidates'] = '; '.join(filter(None, candidates + possible))
        row['reclassify_detail'] = '; '.join(filter(None, details))

        results_count[primary_action] += 1

        if args.verbose and (i + 1) % 10000 == 0:
            print(f"  已處理 {i + 1:,} 筆...")

    # 寫出
    print(f"\n寫入 {output_path}...")
    write_output(output_path, rows, headers, fmt)

    # 摘要
    summary = generate_summary(results_count, len(rows))
    print(f"\n{summary}")


if __name__ == '__main__':
    main()
