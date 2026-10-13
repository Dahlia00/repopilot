"""Evidence-bound behavioral contracts and bounded AST compatibility checks.

Never compile/eval/import proposed code. Constant propagation is deliberately
limited; unknown semantics fail closed rather than becoming approval evidence.
"""
import ast
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

Scalar = str | int | float | bool | None
LiteralValue = Scalar | list[Scalar]


class BehaviorCase(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    arguments: list[LiteralValue] = Field(max_length=8)
    outcome: Literal['returns', 'raises']
    value: LiteralValue = None
    exception: str | None = None


class BehavioralContract(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    finding_id: str
    file: str
    function: str
    current_behavior: str = Field(max_length=2000)
    problem: str = Field(max_length=2000)
    desired_behavior: str | None = Field(default=None, max_length=2000)
    desired_behavior_confidence: int = Field(ge=0, le=100)
    contract_source: Literal['repository_context', 'existing_tests', 'finding', 'inferred']
    evidence_path: str | None = None
    evidence_quote: str | None = Field(default=None, max_length=2000)
    cases: list[BehaviorCase] = Field(default_factory=list, max_length=3)
    behavior_ambiguous: bool = True


class Compatibility(BaseModel):
    compatible: bool = False
    reason: str = 'No evidence-bound behavioral contract is available.'
    behavior_ambiguous: bool = True


def contract_is_grounded(contract, sources):
    if contract is None or contract.behavior_ambiguous:
        return False
    grounded = (contract.contract_source in {'repository_context', 'existing_tests'}
            and contract.desired_behavior_confidence >= 90
            and bool(contract.desired_behavior) and bool(contract.cases)
            and contract.desired_behavior == contract.evidence_quote
            and contract.function in contract.evidence_quote
            and contract.evidence_path in sources
            and contract.evidence_quote in sources[contract.evidence_path])
    if not grounded:
        return False
    if contract.contract_source == 'existing_tests':
        try:
            documented = test_cases(sources[contract.evidence_path], contract.function)
            return all(case in documented for case in contract.cases)
        except (Unknown, SyntaxError, ValueError, TypeError, RecursionError):
            return False
    if contract.evidence_path.endswith('.py'):
        # Current implementation is not a specification of intended behavior.
        try:
            module = ast.parse(sources[contract.evidence_path])
            docs = [ast.get_docstring(n) or '' for n in ast.walk(module) if isinstance(n, (ast.Module, ast.FunctionDef, ast.ClassDef))]
            return any(contract.evidence_quote in doc for doc in docs)
        except (SyntaxError, ValueError, RecursionError):
            return False
    return contract.evidence_path.endswith(('.md', '.txt', '.rst'))


def normalize_contract(contract, sources, finding_id, file, function):
    if contract is None:
        return BehavioralContract(finding_id=finding_id, file=file, function=function,
            current_behavior='See review finding and source.', problem='Desired behavior is not established.',
            desired_behavior_confidence=0, contract_source='inferred')
    identity = (contract.finding_id, contract.file, contract.function) == (finding_id, file, function)
    if not identity or not contract_is_grounded(contract, sources):
        return contract.model_copy(update={'finding_id':finding_id, 'file':file, 'function':function,
                                          'behavior_ambiguous':True})
    return contract


class Unknown(Exception):
    pass


class Outcome(Exception):
    def __init__(self, kind, value):
        self.kind, self.value = kind, value


def literal(node):
    try:
        value = ast.literal_eval(node)
    except (ValueError, TypeError, SyntaxError, RecursionError):
        raise Unknown('Inputs/expectations must be literal values.')
    if len(repr(value)) > 4000:
        raise Unknown('Literal exceeds compatibility budget.')
    return value


def target_call(node, aliases):
    return isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in aliases and not node.keywords


def test_cases(code, function):
    tree = ast.parse(code)
    aliases = {a.asname or a.name for n in tree.body if isinstance(n, ast.ImportFrom) for a in n.names if a.name == function}
    pytest_aliases = {a.asname or a.name for n in tree.body if isinstance(n, ast.Import) for a in n.names if a.name == 'pytest'}
    cases = []
    covered = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Assert) and isinstance(n.test, ast.Compare):
            compare = n.test
            if len(compare.ops) == 1 and isinstance(compare.ops[0], (ast.Eq, ast.Is)) and target_call(compare.left, aliases):
                call = compare.left
                value = literal(compare.comparators[0])
                if isinstance(compare.ops[0], ast.Is) and value is not None and type(value) is not bool:
                    raise Unknown('Identity assertions require None or a boolean singleton.')
                cases.append(BehaviorCase(arguments=[literal(arg) for arg in call.args],outcome='returns',value=value))
                covered.add(id(call))
        if isinstance(n, ast.With) and len(n.items)==1:
            call = n.items[0].context_expr
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and isinstance(call.func.value, ast.Name) and call.func.value.id in pytest_aliases and call.func.attr=='raises' and len(call.args)==1 and not call.keywords and isinstance(call.args[0],ast.Name):
                targets=[x for statement in n.body for x in ast.walk(statement) if target_call(x,aliases)]
                if len(n.body)==1 and len(targets)==1 and isinstance(n.body[0], ast.Expr) and n.body[0].value is targets[0]:
                    target=targets[0]
                    cases.append(BehaviorCase(arguments=[literal(arg) for arg in target.args],outcome='raises',exception=call.args[0].id))
                    covered.add(id(target))
    all_calls = {id(n) for n in ast.walk(tree) if target_call(n,aliases)}
    if not cases or len(cases)>3 or all_calls != covered:
        raise Unknown('Every target call must have a supported literal equality/identity assertion or exact pytest.raises expectation.')
    return cases


def static_outcome(code, function, arguments):
    if len(repr(arguments)) > 4000: raise Unknown('Case inputs exceed compatibility budget.')
    tree=ast.parse(code)
    target=next((n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==function),None)
    if target is None or target.args.vararg or target.args.kwarg or target.args.kwonlyargs or len(target.args.posonlyargs+target.args.args)!=len(arguments):
        raise Unknown('Unsupported target signature.')
    env=dict(zip([a.arg for a in target.args.posonlyargs+target.args.args],arguments))
    budget=[200]
    def expr(n):
        budget[0]-=1
        if budget[0]<0: raise Unknown('Compatibility step budget exceeded.')
        if isinstance(n,ast.Constant): return n.value
        if isinstance(n,ast.Name) and n.id in env: return env[n.id]
        if isinstance(n,ast.UnaryOp) and isinstance(n.op,ast.Not): return not expr(n.operand)
        if isinstance(n,ast.IfExp): return expr(n.body if expr(n.test) else n.orelse)
        if isinstance(n,ast.Subscript):
            collection,index=expr(n.value),expr(n.slice)
            if not isinstance(collection,(list,tuple,str,dict)) or not isinstance(index,(int,str)): raise Unknown('Unsupported subscript types.')
            try: return collection[index]
            except (IndexError,KeyError) as e: raise Outcome('raises',type(e).__name__)
        if isinstance(n,ast.BoolOp):
            value=None
            for v in n.values:
                value=expr(v)
                if isinstance(n.op,ast.And) and not value or isinstance(n.op,ast.Or) and value: break
            return value
        if isinstance(n,ast.Compare) and len(n.ops)==1:
            a,b=expr(n.left),expr(n.comparators[0]); op=n.ops[0]
            if isinstance(op,ast.Eq): return a==b
            if isinstance(op,ast.NotEq): return a!=b
            if isinstance(op,ast.Is): return a is b
            if isinstance(op,ast.IsNot): return a is not b
            if isinstance(op,ast.Gt): return a>b
            if isinstance(op,ast.GtE): return a>=b
            if isinstance(op,ast.Lt): return a<b
            if isinstance(op,ast.LtE): return a<=b
        if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in {'len','bool'} and len(n.args)==1 and not n.keywords:
            value=expr(n.args[0]); return len(value) if n.func.id=='len' else bool(value)
        raise Unknown('Unsupported expression: '+type(n).__name__)
    def statements(nodes):
        for n in nodes:
            if isinstance(n,ast.Return): raise Outcome('returns',expr(n.value) if n.value else None)
            if isinstance(n,ast.If): statements(n.body if expr(n.test) else n.orelse)
            elif isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name): env[n.targets[0].id]=expr(n.value)
            elif isinstance(n,ast.Raise) and isinstance(n.exc,ast.Call) and isinstance(n.exc.func,ast.Name):
                if n.exc.func.id not in {'ValueError','IndexError','TypeError','KeyError','ZeroDivisionError','AssertionError'}: raise Unknown('Unsupported exception.')
                raise Outcome('raises',n.exc.func.id)
            elif isinstance(n,ast.Expr) and isinstance(n.value,ast.Constant) and isinstance(n.value.value,str): pass
            elif isinstance(n,ast.Pass): pass
            elif not isinstance(n,ast.If): raise Unknown('Unsupported statement: '+type(n).__name__)
    try:
        statements(target.body)
        return 'returns',None
    except Outcome as outcome:
        return outcome.kind,outcome.value


def compatibility(fix, test, sources):
    contract=fix.contract
    if test is None or contract is None or test.contract is None:
        return Compatibility(reason='Missing shared behavioral contract or regression test.')
    if contract.model_dump()!=test.contract.model_dump():
        return Compatibility(reason='Test and fix carry different behavioral contracts.',behavior_ambiguous=False)
    if not contract_is_grounded(contract,sources):
        return Compatibility(reason='Desired behavior is ambiguous or lacks authoritative repository evidence.')
    try:
        if contract.file!=fix.file or contract.file!=test.file or contract.finding_id!=test.finding_id:
            raise Unknown('Contract identity does not match the test/file.')
        actual=test_cases(test.test_code,contract.function)
        if [c.model_dump() for c in actual]!=[c.model_dump() for c in contract.cases]:
            return Compatibility(reason='Test expectations differ from desired contract cases.',behavior_ambiguous=False)
        changed=False
        for case in contract.cases:
            expected=(case.outcome,case.exception if case.outcome=='raises' else case.value)
            outcome = static_outcome(fix.fixed_code,contract.function,case.arguments)
            if outcome != expected or type(outcome[1]) is not type(expected[1]):
                return Compatibility(reason='Proposed fix does not satisfy the regression test/desired outcome.',behavior_ambiguous=False)
            before = static_outcome(fix.original_code,contract.function,case.arguments)
            changed |= before != expected or type(before[1]) is not type(expected[1])
        if not changed:
            return Compatibility(reason='Cases already pass before the fix; they do not demonstrate a regression.',behavior_ambiguous=False)
    except (Unknown,ValueError,TypeError,SyntaxError,RecursionError) as e:
        return Compatibility(reason='Compatibility could not be established: '+str(e),behavior_ambiguous=False)
    return Compatibility(compatible=True,reason='Shared evidence-bound contract, test expectations and bounded static fix outcomes agree.',behavior_ambiguous=False)
