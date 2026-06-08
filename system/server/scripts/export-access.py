from __future__ import annotations

import csv
import os
from pathlib import Path

from access_parser import AccessParser


SERVER_ROOT = Path(__file__).resolve().parent.parent
IMPORT_DIR = SERVER_ROOT / "import"
SOURCE_PATH = Path(os.environ["ACCESS_SOURCE"]) if os.environ.get("ACCESS_SOURCE") else None

TABLE_FILES = [
    ("benming_master", "benming_master.csv"),
    ("benming_ch_ProdCat", "benming_ch_ProdCat.csv"),
    ("benming_ch_prod", "benming_ch_prod.csv"),
    ("benming_ch_prodphoto", "benming_ch_prodphoto.csv"),
    ("benming_ch_NewsCat", "benming_ch_NewsCat.csv"),
    ("benming_ch_news", "benming_ch_news.csv"),
    ("benming_ch_job", "benming_ch_job.csv"),
    ("benming_ch_Msg", "benming_ch_Msg.csv"),
    ("benming_ch_Contact", "benming_ch_Contact.csv"),
    ("benming_ch_Cocat", "benming_ch_Cocat.csv"),
    ("benming_ch_MetaType", "benming_ch_MetaType.csv"),
    ("benming_ch_config", "benming_ch_config.csv"),
    ("benming_ch_worldec_Temp", "benming_ch_worldec_Temp.csv"),
    ("benming_ch_cuskind", "benming_ch_cuskind.csv"),
    ("benming_ch_cuslabel", "benming_ch_cuslabel.csv"),
]


def main() -> None:
    if SOURCE_PATH is None:
        raise SystemExit("ACCESS_SOURCE is required, for example ACCESS_SOURCE=/path/to/legacy.mdb")

    if not SOURCE_PATH.exists():
        raise SystemExit(f"Access database not found: {SOURCE_PATH}")

    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    parser = AccessParser(str(SOURCE_PATH))

    for table_name, output_name in TABLE_FILES:
        table = parser.get_table(table_name)
        table.parse()

        columns = [table.columns[index].col_name_str for index in sorted(table.columns)]
        column_data = table.parsed_table
        row_count = max((len(values) for values in column_data.values()), default=0)
        output_path = IMPORT_DIR / output_name

        with output_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(columns)
            for row_index in range(row_count):
                writer.writerow(
                    [normalize_value(get_value(column_data, column_name, row_index)) for column_name in columns]
                )

        print(f"Exported {table_name}: {row_count} rows -> {output_path}")


def get_value(column_data: dict[str, list], column_name: str, row_index: int):
    values = column_data.get(column_name, [])
    if row_index >= len(values):
        return None
    return values[row_index]


def normalize_value(value):
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


if __name__ == "__main__":
    main()
