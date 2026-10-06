from dataclasses import dataclass
import hashlib
import json

@dataclass
class GSTR3BPayload:
    table_3_1: dict
    table_3_2: dict
    table_4: dict
    table_5: dict
    table_6: dict
    payload_hash: str

def build_gstr3b_payload(return_data: dict, invoices: list) -> GSTR3BPayload:
    payload_dict = {
        'table_3_1': {},
        'table_3_2': {},
        'table_4': {},
        'table_5': {},
        'table_6': {}
    }
    payload_str = json.dumps(payload_dict, sort_keys=True)
    payload_hash = hashlib.sha256(payload_str.encode()).hexdigest()
    
    return GSTR3BPayload(
        table_3_1=payload_dict['table_3_1'],
        table_3_2=payload_dict['table_3_2'],
        table_4=payload_dict['table_4'],
        table_5=payload_dict['table_5'],
        table_6=payload_dict['table_6'],
        payload_hash=payload_hash
    )

def build_idempotency_key(gstin: str, period: str, payload_hash: str) -> str:
    from datetime import datetime
    hour_bucket = datetime.utcnow().strftime('%Y%m%d%H')
    raw_str = f"{gstin}{period}{payload_hash}{hour_bucket}"
    return hashlib.sha256(raw_str.encode()).hexdigest()
