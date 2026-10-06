from dataclasses import dataclass
from typing import List

@dataclass
class RuleCheckResult:
    rule_id: str
    rule_name: str
    category: str
    severity: str
    passed: bool
    message: str
    affected_value: str
    threshold: str

@dataclass
class RuleCheckReport:
    checks_passed: int
    checks_failed: int
    checks_warned: int
    blocking_failures: List[RuleCheckResult]
    warnings: List[RuleCheckResult]
    details: List[RuleCheckResult]

def run_all_checks(return_data: dict, invoices: list, client: dict) -> RuleCheckReport:
    results = []
    # Mocking a few rules out of 38
    results.append(RuleCheckResult('R01', 'GSTIN format validation', 'Validation', 'BLOCKING', True, 'GSTIN format valid', '', ''))
    
    failures = [r for r in results if not r.passed and r.severity == 'BLOCKING']
    warnings = [r for r in results if not r.passed and r.severity == 'WARNING']
    
    return RuleCheckReport(
        checks_passed=len([r for r in results if r.passed]),
        checks_failed=len(failures),
        checks_warned=len(warnings),
        blocking_failures=failures,
        warnings=warnings,
        details=results
    )
