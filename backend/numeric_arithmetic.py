"""Bounded scalar arithmetic shared by static compatibility and execution policy."""
import ast
import math

MAX_NUMBER = 10000


def number(value):
    if type(value) not in (int, float) or abs(value) > MAX_NUMBER or not math.isfinite(value):
        raise ValueError('Arithmetic requires finite int/float operands and results within ±10000.')
    return value


def arithmetic(node, names, budget=None):
    budget = [200] if budget is None else budget
    budget[0] -= 1
    if budget[0] < 0:
        raise ValueError('Arithmetic step budget exceeded.')
    if isinstance(node, ast.Constant):
        return number(node.value)
    if isinstance(node, ast.Name) and node.id in names:
        return number(names[node.id])
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
        left = arithmetic(node.left, names, budget)
        right = arithmetic(node.right, names, budget)
        if isinstance(node.op, ast.Add):
            result = left + right
        elif isinstance(node.op, ast.Sub):
            result = left - right
        elif isinstance(node.op, ast.Mult):
            result = left * right
        else:
            if right == 0:
                raise ValueError('Division by zero is outside supported arithmetic.')
            result = left / right
        return number(result)
    raise ValueError('Arithmetic accepts only numeric literals, bound arguments/locals, and Add/Sub/Mult/Div.')


def arithmetic_shape(node):
    """Names need concrete validation against contract cases before execution."""
    if isinstance(node, ast.Name):
        return True
    if isinstance(node, ast.Constant):
        try:
            number(node.value)
            return True
        except (ValueError, OverflowError):
            return False
    return (isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div))
            and arithmetic_shape(node.left) and arithmetic_shape(node.right))


def same_outcome(actual, expected):
    # Python equality tests accept 80.0 == 80, while bool is not numeric evidence.
    if actual[0] == expected[0] == 'returns' and type(actual[1]) in (int, float) and type(expected[1]) in (int, float):
        return number(actual[1]) == number(expected[1])
    return actual == expected and type(actual[1]) is type(expected[1])
