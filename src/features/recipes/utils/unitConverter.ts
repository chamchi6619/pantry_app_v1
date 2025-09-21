import { ConversionResult, CanonicalIngredient } from '../types';

interface UnitDefinition {
  type: 'volume' | 'weight' | 'count' | 'other';
  baseUnit: string;
  factor: number;
}

export class UnitConverter {
  private units: Record<string, UnitDefinition> = {
    // Volume units (base: ml)
    'ml': { type: 'volume', baseUnit: 'ml', factor: 1 },
    'L': { type: 'volume', baseUnit: 'ml', factor: 1000 },
    'tsp': { type: 'volume', baseUnit: 'ml', factor: 4.92892 },
    'tbsp': { type: 'volume', baseUnit: 'ml', factor: 14.7868 },
    'fl oz': { type: 'volume', baseUnit: 'ml', factor: 29.5735 },
    'cup': { type: 'volume', baseUnit: 'ml', factor: 236.588 },
    'pt': { type: 'volume', baseUnit: 'ml', factor: 473.176 },
    'qt': { type: 'volume', baseUnit: 'ml', factor: 946.353 },
    'gal': { type: 'volume', baseUnit: 'ml', factor: 3785.41 },

    // Weight units (base: g)
    'g': { type: 'weight', baseUnit: 'g', factor: 1 },
    'kg': { type: 'weight', baseUnit: 'g', factor: 1000 },
    'mg': { type: 'weight', baseUnit: 'g', factor: 0.001 },
    'oz': { type: 'weight', baseUnit: 'g', factor: 28.3495 },
    'lb': { type: 'weight', baseUnit: 'g', factor: 453.592 },

    // Count units
    'piece': { type: 'count', baseUnit: 'piece', factor: 1 },
    'dozen': { type: 'count', baseUnit: 'piece', factor: 12 },
    'slice': { type: 'count', baseUnit: 'piece', factor: 1 },
    'clove': { type: 'count', baseUnit: 'piece', factor: 1 },
    'can': { type: 'count', baseUnit: 'piece', factor: 1 },
    'package': { type: 'count', baseUnit: 'piece', factor: 1 },
    'jar': { type: 'count', baseUnit: 'piece', factor: 1 },
    'bottle': { type: 'count', baseUnit: 'piece', factor: 1 },
    'bunch': { type: 'count', baseUnit: 'piece', factor: 1 },
    'head': { type: 'count', baseUnit: 'piece', factor: 1 },
    'stalk': { type: 'count', baseUnit: 'piece', factor: 1 },
    'stick': { type: 'count', baseUnit: 'piece', factor: 1 },
    'sprig': { type: 'count', baseUnit: 'piece', factor: 1 },

    // Colloquial units
    'pinch': { type: 'volume', baseUnit: 'ml', factor: 0.308 },
    'dash': { type: 'volume', baseUnit: 'ml', factor: 0.616 },
    'handful': { type: 'volume', baseUnit: 'ml', factor: 59.15 }
  };

  // Direct conversions that don't require density
  private directConversions: Record<string, Record<string, number>> = {
    // Within volume units
    'tsp': { 'tbsp': 1/3, 'cup': 1/48, 'ml': 4.92892, 'fl oz': 1/6 },
    'tbsp': { 'tsp': 3, 'cup': 1/16, 'ml': 14.7868, 'fl oz': 0.5 },
    'cup': { 'tbsp': 16, 'tsp': 48, 'ml': 236.588, 'fl oz': 8, 'pt': 0.5, 'qt': 0.25 },
    'pt': { 'cup': 2, 'qt': 0.5, 'ml': 473.176, 'fl oz': 16 },
    'qt': { 'pt': 2, 'cup': 4, 'gal': 0.25, 'ml': 946.353, 'L': 0.946353 },
    'gal': { 'qt': 4, 'cup': 16, 'L': 3.78541, 'ml': 3785.41 },

    // Within weight units
    'g': { 'kg': 0.001, 'mg': 1000, 'oz': 0.035274, 'lb': 0.00220462 },
    'kg': { 'g': 1000, 'lb': 2.20462, 'oz': 35.274 },
    'oz': { 'g': 28.3495, 'lb': 0.0625, 'kg': 0.0283495 },
    'lb': { 'oz': 16, 'g': 453.592, 'kg': 0.453592 },

    // Special colloquial conversions
    'pinch': { 'tsp': 0.0625, 'ml': 0.308 },
    'dash': { 'tsp': 0.125, 'pinch': 2, 'ml': 0.616 },
    'handful': { 'cup': 0.25, 'tbsp': 4, 'ml': 59.15 }
  };

  convert(
    quantity: number,
    fromUnit: string,
    toUnit: string,
    ingredient?: CanonicalIngredient
  ): ConversionResult {
    // Handle same unit
    if (fromUnit === toUnit) {
      return {
        success: true,
        value: quantity,
        unit: toUnit
      };
    }

    // Check for direct conversion
    if (this.hasDirectConversion(fromUnit, toUnit)) {
      return this.directConvert(quantity, fromUnit, toUnit);
    }

    // Check if conversion requires density
    if (this.requiresDensity(fromUnit, toUnit)) {
      if (!ingredient) {
        return {
          success: false,
          reason: 'missing_ingredient',
          message: `Cannot convert ${fromUnit} to ${toUnit} without knowing the ingredient`
        };
      }

      // Check if conversion is safe for this ingredient
      if (!ingredient.safeConversions) {
        return {
          success: false,
          reason: 'unsafe_conversion',
          message: `Cannot safely convert ${fromUnit} to ${toUnit} for ${ingredient.displayName}`
        };
      }

      return this.densityConvert(quantity, fromUnit, toUnit, ingredient.density);
    }

    // Try conversion through base units
    const fromDef = this.units[fromUnit];
    const toDef = this.units[toUnit];

    if (!fromDef || !toDef) {
      return {
        success: false,
        reason: 'unknown_unit',
        message: `Unknown unit: ${!fromDef ? fromUnit : toUnit}`
      };
    }

    if (fromDef.type !== toDef.type) {
      return {
        success: false,
        reason: 'incompatible_units',
        message: `Cannot convert between ${fromDef.type} and ${toDef.type} units`
      };
    }

    // Convert through base unit
    const baseValue = quantity * fromDef.factor;
    const result = baseValue / toDef.factor;

    return {
      success: true,
      value: this.roundToReasonable(result),
      unit: toUnit
    };
  }

  private hasDirectConversion(fromUnit: string, toUnit: string): boolean {
    return !!(this.directConversions[fromUnit]?.[toUnit] ||
              this.directConversions[toUnit]?.[fromUnit]);
  }

  private directConvert(quantity: number, fromUnit: string, toUnit: string): ConversionResult {
    const factor = this.directConversions[fromUnit]?.[toUnit] ||
                   (this.directConversions[toUnit]?.[fromUnit] ?
                    1 / this.directConversions[toUnit][fromUnit] : null);

    if (factor === null) {
      return {
        success: false,
        reason: 'no_conversion',
        message: `No direct conversion from ${fromUnit} to ${toUnit}`
      };
    }

    return {
      success: true,
      value: this.roundToReasonable(quantity * factor),
      unit: toUnit
    };
  }

  private requiresDensity(fromUnit: string, toUnit: string): boolean {
    const fromDef = this.units[fromUnit];
    const toDef = this.units[toUnit];

    if (!fromDef || !toDef) return false;

    // Volume to weight or weight to volume requires density
    return (fromDef.type === 'volume' && toDef.type === 'weight') ||
           (fromDef.type === 'weight' && toDef.type === 'volume');
  }

  private densityConvert(
    quantity: number,
    fromUnit: string,
    toUnit: string,
    density: number
  ): ConversionResult {
    const fromDef = this.units[fromUnit];
    const toDef = this.units[toUnit];

    if (!fromDef || !toDef) {
      return {
        success: false,
        reason: 'unknown_unit',
        message: `Unknown unit: ${!fromDef ? fromUnit : toUnit}`
      };
    }

    let result: number;

    if (fromDef.type === 'volume' && toDef.type === 'weight') {
      // Volume to weight: multiply by density
      const volumeInMl = quantity * fromDef.factor;
      const weightInG = volumeInMl * density;
      result = weightInG / toDef.factor;
    } else if (fromDef.type === 'weight' && toDef.type === 'volume') {
      // Weight to volume: divide by density
      const weightInG = quantity * fromDef.factor;
      const volumeInMl = weightInG / density;
      result = volumeInMl / toDef.factor;
    } else {
      return {
        success: false,
        reason: 'invalid_conversion',
        message: `Invalid density conversion between ${fromUnit} and ${toUnit}`
      };
    }

    return {
      success: true,
      value: this.roundToReasonable(result),
      unit: toUnit
    };
  }

  private roundToReasonable(value: number): number {
    // Round to 2 decimal places for most values
    if (value >= 1) {
      return Math.round(value * 100) / 100;
    }

    // For small values, keep more precision
    if (value >= 0.1) {
      return Math.round(value * 1000) / 1000;
    }

    // For very small values, keep even more precision
    return Math.round(value * 10000) / 10000;
  }

  // Helper function to normalize units for consistency
  normalizeUnit(unit: string): string {
    const normalizations: Record<string, string> = {
      'tablespoons': 'tbsp',
      'tablespoon': 'tbsp',
      'teaspoons': 'tsp',
      'teaspoon': 'tsp',
      'cups': 'cup',
      'ounces': 'oz',
      'ounce': 'oz',
      'pounds': 'lb',
      'pound': 'lb',
      'lbs': 'lb',
      'grams': 'g',
      'gram': 'g',
      'kilograms': 'kg',
      'kilogram': 'kg',
      'milliliters': 'ml',
      'milliliter': 'ml',
      'liters': 'L',
      'liter': 'L',
      'fluid ounces': 'fl oz',
      'fluid ounce': 'fl oz',
      'quarts': 'qt',
      'quart': 'qt',
      'pints': 'pt',
      'pint': 'pt',
      'gallons': 'gal',
      'gallon': 'gal'
    };

    return normalizations[unit.toLowerCase()] || unit.toLowerCase();
  }

  // Check if a unit is a volume unit
  isVolumeUnit(unit: string): boolean {
    return this.units[unit]?.type === 'volume';
  }

  // Check if a unit is a weight unit
  isWeightUnit(unit: string): boolean {
    return this.units[unit]?.type === 'weight';
  }

  // Get all compatible units for conversion
  getCompatibleUnits(unit: string): string[] {
    const unitDef = this.units[unit];
    if (!unitDef) return [];

    // Get all units of the same type
    const compatible = Object.keys(this.units)
      .filter(u => this.units[u].type === unitDef.type);

    // Add units that have direct conversions
    const directUnits = Object.keys(this.directConversions[unit] || {});

    return [...new Set([...compatible, ...directUnits])];
  }
}

export const unitConverter = new UnitConverter();