import pytest

from demo_discount import apply_discount


def test_twenty_percent_discount():
    assert apply_discount(100, 20) == 80


def test_invalid_discount_is_rejected():
    with pytest.raises(ValueError):
        apply_discount(100, 120)
