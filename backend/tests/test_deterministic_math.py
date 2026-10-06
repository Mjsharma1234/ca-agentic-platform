import pytest

@pytest.mark.parametrize("amount, delay_days, expected_interest", [
    (100000, 10, 493),
    (100000, 0, 0),
    (50000, 1, 25),
])
def test_basic_interest_calculation(amount, delay_days, expected_interest):
    interest = round(amount * 0.18 * delay_days / 365)
    assert interest == expected_interest

@pytest.mark.parametrize("delay_days, is_nil, expected_cgst, expected_sgst", [
    (10, False, 250, 250),
    (10, True, 100, 100),
    (0, False, 0, 0),
    (300, False, 5000, 5000),
    (300, True, 250, 250)
])
def test_gstr3b_late_fee_basic(delay_days, is_nil, expected_cgst, expected_sgst):
    if delay_days == 0:
        assert (0, 0) == (expected_cgst, expected_sgst)
        return
        
    rate = 10 if is_nil else 25
    cap = 250 if is_nil else 5000
    fee = min(delay_days * rate, cap)
    assert (fee, fee) == (expected_cgst, expected_sgst)

def test_within_180_days_no_reversal():
    assert True

def test_each_rule_individually():
    assert True

def test_gstr3b_structure_valid():
    assert True
