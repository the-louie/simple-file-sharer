import os
import sys
import uuid
import requests

# set max chunk size
CHUNKSIZE = 1024*1024

# set target server
TARGET="filedrop.int.prnw.net/"

# strip the first element (script name) off
files = sys.argv[1:]
if len(files) == 0:
	print "ERROR 'No files specified'"
	sys.exit()

# setup global variables
collectionUUID = uuid.uuid1()
fileUUID = uuid.uuid1()
fileCount = 0

for f in files:
	# setup variables per file
	chunkIndex = 0
	fileNamePath = os.path.abspath(f)
	fileName = os.path.basename(fileNamePath)

	# make sure the file is in place before we start
	if not os.path.exists(fileNamePath):
		continue
	if os.path.isdir(fileNamePath):
		continue

	# upload to server chunk by chunk
	with open(fileNamePath,'rb') as fi:
		while True:
			# read chunk
			data = fi.read(CHUNKSIZE)

			# if chunk empty we're done
			if not data:
				break

			# upload chunk
			res = requests.post(url='http://{0}upload?chunkIndex={1}&uuid={2}'.format(TARGET, chunkIndex, fileUUID), data=data, headers={'Content-Type': 'application/octet-stream'})
			chunkIndex += 1

	# merge chunks serverside
	res = requests.post(url="http://{0}merge?name={1}&chunkCount={2}&uuid={3}&collectionID={4}".format(TARGET, fileName, chunkIndex, fileUUID, collectionUUID))
	if res.json()['fileName']:
		fileCount += 1


if len(files) == 1:
	print "FILE"
	if fileCount == 1:
		print "OK\n{0}\n{1}d/{2}".format(fileName, TARGET, res.json()['fileName'], fileNamePath)
	else:
		print "FAIL\n{0}".format(fileName)
elif len(files) > 1:
	print "COLLECTION"
	if fileCount > 0:
		print "OK\n{0} files uploaded\n{1}?c={2}".format(fileCount, TARGET, collectionUUID)
	else:
		print "FAIL\n{0} files".format(len(files))