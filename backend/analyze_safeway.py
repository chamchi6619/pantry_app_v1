#!/usr/bin/env python3

ocr = """79921082501 BIONATURAE PASTA E
4.79
3.99 S
GROCERY
79804601011 O ORG OLIVE OIL
15.99
15.99 S
7989312513 0 ORG JALAPENO PPR
2.79
2.79 S
7989340154 0 ORG BROWN EGGS A
GEN MERCHANDISE
8.49
8.49 S"""

lines = ocr.split('\n')

print("=== ANALYZING SAFEWAY RECEIPT PATTERNS ===\n")

for i, line in enumerate(lines):
    print(f"{i:2}: {line}")

print("\n=== BIONATURAE PASTA ===")
print(f"Line 0: {lines[0]} <- Code + Name")
print(f"Line 1: {lines[1]} <- First price (original)")
print(f"Line 2: {lines[2]} <- Second price (discount) *** SHOULD TAKE THIS")
print("\nPattern: Price on separate lines, NOT same line!")

print("\n=== ORG BROWN EGGS ===")
print(f"Line 10: {lines[10]} <- Code + Name")
print(f"Line 11: {lines[11]} <- Category header (SKIP)")
print(f"Line 12: {lines[12]} <- First price")
print(f"Line 13: {lines[13]} <- Second price (discount) *** SHOULD TAKE THIS")
print("\nPattern: Category header between name and price, then discount on next line")
