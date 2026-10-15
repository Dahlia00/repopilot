import unittest

from demo_discount import apply_discount


class DiscountBehaviorTests(unittest.TestCase):
    @unittest.skip("Behavior specification used for the RepoPilot demo PR")
    def test_twenty_percent_discount(self):
        self.assertEqual(apply_discount(100, 20), 80)

    @unittest.skip("Behavior specification used for the RepoPilot demo PR")
    def test_invalid_discount_is_rejected(self):
        with self.assertRaises(ValueError):
            apply_discount(100, 120)


if __name__ == "__main__":
    unittest.main()
