def apply_discount(price, percent):
    """Return the price after applying a percentage discount.

    Example: apply_discount(100, 20) returns 80.
    percent must be between 0 and 100.
    Values outside that range raise ValueError.
    """
    if percent < 0 or percent > 100:
        raise ValueError("percent must be between 0 and 100")

    return price * (1 + percent / 100)
