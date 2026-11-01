import io
import re
import csv
from datetime import datetime
from typing import Dict, Any, List, Tuple
from dataclasses import asdict
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

from .task_generator import ProfileTaskGenerator, PAN_REGEX, GSTIN_REGEX

SAMPLE_CLIENT_ROWS = [
    {
        "name": "Deccan Precision Engineering Pvt Ltd",
        "pan": "AAACD4492K",
        "gstin": "36AAACD4492K1Z8",
        "type": "Private Limited",
        "turnover": 85000000,
        "is_composition": False,
        "assigned_partner": "CA Amit Sharma",
        "email": "cfo@deccanprecision.com",
        "phone": "+91 98490 12345"
    },
    {
        "name": "Telangana Cotton Ginning Mills LLP",
        "pan": "AABCT8812L",
        "gstin": "36AABCT8812L1Z4",
        "type": "LLP",
        "turnover": 42000000,
        "is_composition": False,
        "assigned_partner": "CA Priya Patel",
        "email": "accounts@telanganacotton.in",
        "phone": "+91 94401 56789"
    },
    {
        "name": "Kranthi Medical & Healthcare Stores",
        "pan": "BKMPK5510M",
        "gstin": "36BKMPK5510M1Z2",
        "type": "Partnership",
        "turnover": 12500000,
        "is_composition": True,
        "assigned_partner": "CA Vikram Singh",
        "email": "kranthi.meds@gmail.com",
        "phone": "+91 98850 99887"
    },
    {
        "name": "Venkateshwara Agro Traders",
        "pan": "AEEPV9941N",
        "gstin": "",
        "type": "Individual",
        "turnover": 4500000,
        "is_composition": False,
        "assigned_partner": "CA Amit Sharma",
        "email": "venkat.agro@outlook.com",
        "phone": "+91 99081 22334"
    }
]

class BulkClientImporter:
    """
    Parses and validates multi-format client onboarding spreadsheets (.xlsx, .csv).
    Enforces PAN/GSTIN syntax validation, auto-detects column variants, and
    orchestrates compliance task instantiation.
    """

    @staticmethod
    def generate_excel_template() -> bytes:
        """Generates an official CA Firm OS client import Excel template with formatting and guidance."""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Client Master Import"

        # Headers
        headers = [
            "Client Legal Name*",
            "Entity PAN*",
            "GSTIN",
            "Constitution Type*",
            "Annual Turnover (INR)*",
            "Composition Scheme? (Y/N)",
            "Assigned Partner*",
            "Contact Email",
            "Contact Phone"
        ]

        # Header styling
        header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid") # Dark Slate
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1')
        )

        ws.append(headers)
        for col_num in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_num)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = border

        # Sample rows
        for row in SAMPLE_CLIENT_ROWS:
            ws.append([
                row["name"],
                row["pan"],
                row["gstin"],
                row["type"],
                row["turnover"],
                "Y" if row["is_composition"] else "N",
                row["assigned_partner"],
                row["email"],
                row["phone"]
            ])

        for r in range(2, len(SAMPLE_CLIENT_ROWS) + 2):
            for c in range(1, len(headers) + 1):
                cell = ws.cell(row=r, column=c)
                cell.border = border
                if c == 5:
                    cell.number_format = '#,##,##0'

        # Auto-fit column widths
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 15)

        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        return stream.getvalue()

    @staticmethod
    def parse_file(file_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Parses Excel (.xlsx) or CSV data into validated client records."""
        lower_name = filename.lower()
        raw_rows = []

        if lower_name.endswith(".xlsx"):
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
            if not rows or len(rows) < 2:
                return {"success": False, "error": "Empty spreadsheet or missing header row."}

            headers = [str(h or "").strip().lower() for h in rows[0]]
            for r in rows[1:]:
                if any(r):
                    raw_rows.append(r)

        elif lower_name.endswith(".csv"):
            text = file_bytes.decode("utf-8-sig", errors="ignore")
            reader = csv.reader(io.StringIO(text))
            rows = list(reader)
            if not rows or len(rows) < 2:
                return {"success": False, "error": "Empty CSV or missing header row."}

            headers = [str(h or "").strip().lower() for h in rows[0]]
            for r in rows[1:]:
                if any(r):
                    raw_rows.append(r)
        else:
            return {"success": False, "error": "Unsupported file format. Please upload .xlsx or .csv"}

        # Map header indices
        def find_col(aliases: List[str]) -> int:
            for idx, h in enumerate(headers):
                if any(a in h for a in aliases):
                    return idx
            return -1

        idx_name = find_col(["legal name", "client name", "name", "company"])
        idx_pan = find_col(["pan", "entity pan"])
        idx_gstin = find_col(["gstin", "gst no", "gst"])
        idx_type = find_col(["constitution", "type", "entity type"])
        idx_turnover = find_col(["turnover", "annual turnover", "sales"])
        idx_comp = find_col(["composition", "cmp"])
        idx_partner = find_col(["partner", "assigned partner", "manager"])
        idx_email = find_col(["email", "mail"])
        idx_phone = find_col(["phone", "mobile", "contact"])

        if idx_name == -1 or idx_pan == -1:
            return {"success": False, "error": "Mandatory columns 'Client Name' and 'Entity PAN' not detected in header row."}

        validated_clients = []
        errors = []
        total_tasks_instantiated = 0

        for row_num, row in enumerate(raw_rows, start=2):
            name = str(row[idx_name] or "").strip()
            pan = str(row[idx_pan] or "").strip().upper()
            gstin = str(row[idx_gstin] or "").strip().upper() if idx_gstin != -1 and len(row) > idx_gstin else ""
            c_type = str(row[idx_type] or "Private Limited").strip() if idx_type != -1 and len(row) > idx_type else "Private Limited"
            
            # Turnover parsing
            turnover = 0.0
            if idx_turnover != -1 and len(row) > idx_turnover and row[idx_turnover]:
                try:
                    clean_to = re.sub(r'[^0-9.]', '', str(row[idx_turnover]))
                    turnover = float(clean_to) if clean_to else 0.0
                except Exception:
                    turnover = 0.0

            is_comp = False
            if idx_comp != -1 and len(row) > idx_comp and row[idx_comp]:
                val_comp = str(row[idx_comp]).strip().lower()
                is_comp = val_comp in ["y", "yes", "true", "1"]

            partner = str(row[idx_partner] or "CA Amit Sharma").strip() if idx_partner != -1 and len(row) > idx_partner else "CA Amit Sharma"
            email = str(row[idx_email] or "").strip() if idx_email != -1 and len(row) > idx_email else ""
            phone = str(row[idx_phone] or "").strip() if idx_phone != -1 and len(row) > idx_phone else ""

            # Row Validation
            row_errors = []
            if not name:
                row_errors.append("Missing client name")
            if not re.match(PAN_REGEX, pan):
                row_errors.append(f"Invalid PAN format: '{pan}'")
            if gstin:
                if not re.match(GSTIN_REGEX, gstin):
                    row_errors.append(f"Invalid GSTIN format: '{gstin}'")
                elif gstin[2:12] != pan:
                    row_errors.append(f"GSTIN PAN ({gstin[2:12]}) mismatch with Client PAN ({pan})")

            if row_errors:
                errors.append({
                    "row_number": row_num,
                    "client_name": name or "Unknown",
                    "issues": row_errors
                })
                continue

            # Generate synthetic unique ID
            cid = f"c{len(validated_clients) + 101}"
            client_dict = {
                "id": cid,
                "name": name,
                "client_name": name,
                "pan": pan,
                "gstin": gstin or "",  # never fabricate a GSTIN; unregistered clients stay blank
                "type": c_type,
                "client_type": c_type,
                "turnover": turnover,
                "annual_turnover": turnover,
                "is_composition": is_comp,
                "assignedPartner": partner,
                "assigned_partner": partner,
                "email": email,
                "phone": phone,
                "risk_tier": "Low" if turnover < 50000000 else "Medium",
                "killSwitchActive": False
            }

            # Instantiate statutory tasks automatically from profile
            tasks = ProfileTaskGenerator.generate_tasks_for_client(client_dict)
            client_dict["tasks_count"] = len(tasks)
            client_dict["generated_tasks"] = [asdict(t) for t in tasks]
            total_tasks_instantiated += len(tasks)

            validated_clients.append(client_dict)

        return {
            "success": True,
            "filename": filename,
            "total_rows_scanned": len(raw_rows),
            "imported_count": len(validated_clients),
            "failed_count": len(errors),
            "tasks_instantiated": total_tasks_instantiated,
            "clients": validated_clients,
            "errors": errors
        }
