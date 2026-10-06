import pytest

@pytest.fixture
def sample_client():
    return {
        "name": "Reliance Industries Ltd",
        "gstin": "27AAPFU0939F1ZV",
        "pan": "AAPFU0939F"
    }

@pytest.fixture
def sample_invoices():
    return [
        {"invoice_number": "INV001", "amount": 100000, "hsn": "8471"},
        {"invoice_number": "INV002", "amount": 250000, "hsn": "3004"}
    ]

@pytest.fixture
def clean_database():
    pass
