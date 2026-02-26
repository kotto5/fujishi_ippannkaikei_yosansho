# ===========================================================
# json_to_csv.py
# ===========================================================
import json, csv, os, glob

json_dir = "/home/claude/json"
csv_dir = "/home/claude/csv"
os.makedirs(csv_dir, exist_ok=True)

for jf in sorted(glob.glob(os.path.join(json_dir, "*.json"))):
    with open(jf, "r", encoding="utf-8") as f:
        obj = json.load(f)
    
    name = obj["sheet_name"]
    csv_path = os.path.join(csv_dir, name + ".csv")
    
    if "columns" in obj:
        # Supplementary files with custom columns
        with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(obj["columns"])
            for row in obj["data"]:
                writer.writerow(row)
    else:
        # Standard budget files with 款,項,目,節,説明,R6,R7
        with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["款","項","目","節","説明","R6","R7"])
            for row in obj["data"]:
                # Convert None to empty string
                csv_row = ["" if v is None else v for v in row]
                writer.writerow(csv_row)
    
    print(f"Created: {csv_path}")

print(f"\nTotal CSV files: {len(glob.glob(os.path.join(csv_dir, '*.csv')))}")
