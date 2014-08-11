#1048576
import random
import sys

for a in ['A','B','C']:
	for c in range(1048576/2):
		sys.stdout.write(a)
		sys.stdout.write(chr(12))
