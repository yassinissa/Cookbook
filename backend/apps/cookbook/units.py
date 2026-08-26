"""
Unit conversion for recipe costing.

Two kinds of conversion:

  1. Same dimension (g → Kg, Tbs → ml). Pure arithmetic on
     UnitScale.factor_to_canonical. Always possible.

  2. Cross dimension (Tbs of an ingredient → g, 1 piece → g). Density- or
     size-dependent, so it needs a per-ingredient bridge. The caller builds
     `bridges` from that SKU's ItemConversion data and passes it in.

`convert()` raises ConversionError when it has no way to get from one unit to
the other — the costing layer catches that and marks the line
`cost_status = 'no_conversion'` rather than silently costing it as zero.
"""
from decimal import Decimal

# canonical unit per dimension — every factor_to_canonical is relative to these
CANONICAL = {'mass': 'g', 'volume': 'ml', 'count': 'each', 'length': 'cm'}


class ConversionError(Exception):
    pass


def _d(x):
    return x if isinstance(x, Decimal) else Decimal(str(x))


def convert(qty, from_unit, to_unit, bridges=None):
    """
    qty in `from_unit` → Decimal in `to_unit`.

    from_unit / to_unit : UnitScale instances (need .dimension + .factor_to_canonical).
    bridges : optional {(from_dim, to_dim): Decimal} where the Decimal converts
              one canonical `from_dim` unit into canonical `to_dim` units
              — e.g. {('volume', 'mass'): Decimal('0.2')} means 1 ml of this
              ingredient weighs 0.2 g.
    """
    qty = _d(qty)
    f_from = _d(from_unit.factor_to_canonical)
    f_to = _d(to_unit.factor_to_canonical)
    if f_from <= 0 or f_to <= 0:
        raise ConversionError(f'unit {from_unit.code!r} or {to_unit.code!r} has no numeric factor')

    if from_unit.dimension == to_unit.dimension:
        return qty * f_from / f_to

    bridges = bridges or {}
    key = (from_unit.dimension, to_unit.dimension)
    if key in bridges:
        # from-unit qty → canonical from → (bridge) canonical to → to-unit qty
        return qty * f_from * _d(bridges[key]) / f_to

    raise ConversionError(
        f'no bridge from {from_unit.dimension} ({from_unit.code}) '
        f'to {to_unit.dimension} ({to_unit.code})'
    )


def invert_bridge(from_dim, to_dim, factor):
    """A bridge is directional; a density also gives you the reverse."""
    factor = _d(factor)
    if factor == 0:
        return None
    return (to_dim, from_dim), Decimal(1) / factor
