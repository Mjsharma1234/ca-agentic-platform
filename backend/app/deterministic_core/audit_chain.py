import hashlib
import json
import uuid
from datetime import datetime
from typing import Dict, Any, Tuple, List
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..models.tenant import AuditBlock, Firm

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

def compute_block_hash(
    sequence: int,
    prev_hash: str,
    actor_id: str,
    actor_role: str,
    action: str,
    entity_type: str,
    entity_id: str,
    payload: Dict[str, Any],
    timestamp: str
) -> str:
    """Calculates SHA-256 digest of block header and contents."""
    canonical_payload = json.dumps(payload, sort_keys=True, default=str)
    raw = f"{sequence}|{prev_hash}|{actor_id}|{actor_role}|{action}|{entity_type}|{entity_id}|{canonical_payload}|{timestamp}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def append_audit_block(
    db: Session,
    firm_id: uuid.UUID,
    actor_id: str,
    actor_role: str,
    action: str,
    entity_type: str,
    entity_id: str,
    payload: Dict[str, Any],
    commit: bool = True,
) -> AuditBlock:
    """Appends a new immutable block to the firm's cryptographic audit chain.

    With commit=False the block is only flushed, so a caller can persist its state change and
    the audit block in ONE transaction (no state without evidence, no evidence without state).
    The firm row is locked (SELECT ... FOR UPDATE on PostgreSQL) so concurrent writers serialise
    instead of forking the chain; (firm_id, sequence) is additionally unique at the DB level.
    """
    db.execute(select(Firm.id).where(Firm.id == firm_id).with_for_update())
    # Find latest block for this firm
    stmt = (
        select(AuditBlock)
        .where(AuditBlock.firm_id == firm_id)
        .order_by(AuditBlock.sequence.desc())
        .limit(1)
    )
    last_block = db.execute(stmt).scalar_one_or_none()

    if last_block:
        new_sequence = last_block.sequence + 1
        prev_hash = last_block.block_hash
    else:
        new_sequence = 1
        prev_hash = GENESIS_HASH

    now = datetime.utcnow()
    iso_time = now.isoformat()
    block_hash = compute_block_hash(
        sequence=new_sequence,
        prev_hash=prev_hash,
        actor_id=actor_id,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload,
        timestamp=iso_time
    )

    block = AuditBlock(
        firm_id=firm_id,
        sequence=new_sequence,
        prev_hash=prev_hash,
        block_hash=block_hash,
        actor_id=actor_id,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        payload_json=payload,
        timestamp=now
    )
    db.add(block)
    if commit:
        db.commit()
        db.refresh(block)
    else:
        db.flush()
    return block

def verify_firm_audit_chain(db: Session, firm_id: uuid.UUID) -> Dict[str, Any]:
    """Cryptographically verifies every block in the firm's audit chain (ICAI SQC-1 standard).
    Detects any database tampering, out-of-order records, or altered historical actions.
    """
    stmt = (
        select(AuditBlock)
        .where(AuditBlock.firm_id == firm_id)
        .order_by(AuditBlock.sequence.asc())
    )
    blocks = list(db.execute(stmt).scalars().all())

    if not blocks:
        return {
            "firm_id": str(firm_id),
            "status": "empty",
            "total_blocks": 0,
            "chain_valid": True,
            "tamper_detected": False,
            "message": "Audit ledger has no entries yet."
        }

    expected_prev = GENESIS_HASH
    for idx, b in enumerate(blocks, start=1):
        # 1. Sequence check
        if b.sequence != idx:
            return {
                "firm_id": str(firm_id),
                "status": "tampered",
                "total_blocks": len(blocks),
                "failed_at_sequence": b.sequence,
                "chain_valid": False,
                "tamper_detected": True,
                "error": f"Sequence anomaly at block {b.id}: expected {idx}, got {b.sequence}"
            }

        # 2. Previous hash chain check
        if b.prev_hash != expected_prev:
            return {
                "firm_id": str(firm_id),
                "status": "tampered",
                "total_blocks": len(blocks),
                "failed_at_sequence": b.sequence,
                "chain_valid": False,
                "tamper_detected": True,
                "error": f"Broken hash linkage at sequence {b.sequence}: expected {expected_prev}, found {b.prev_hash}"
            }

        # 3. Hash integrity check
        computed_hash = compute_block_hash(
            sequence=b.sequence,
            prev_hash=b.prev_hash,
            actor_id=b.actor_id,
            actor_role=b.actor_role,
            action=b.action,
            entity_type=b.entity_type,
            entity_id=b.entity_id,
            payload=b.payload_json,
            timestamp=b.timestamp.isoformat()
        )

        if computed_hash != b.block_hash:
            return {
                "firm_id": str(firm_id),
                "status": "tampered",
                "total_blocks": len(blocks),
                "failed_at_sequence": b.sequence,
                "chain_valid": False,
                "tamper_detected": True,
                "error": f"Content tampering detected in block {b.sequence}: hash mismatch"
            }

        expected_prev = b.block_hash

    return {
        "firm_id": str(firm_id),
        "status": "verified",
        "total_blocks": len(blocks),
        "head_hash": blocks[-1].block_hash,
        "genesis_hash": blocks[0].block_hash,
        "chain_valid": True,
        "tamper_detected": False,
        "certified_at": datetime.utcnow().isoformat(),
        "compliance_standard": "ICAI SQC 1 / Digital Evidence Standard Section 65B"
    }
