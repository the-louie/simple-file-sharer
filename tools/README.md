These scripts are made for use in Apple Automator workflows. But can probably be reused in a multitude of ways.

## sfs_upload.py
Upload files from commandline, the result is returned as a couple of rows to stdout that osx-helper.sh uses.

## osx-helper.sh
This script takes the output from the sfs_upload.py script and:
	* puts the url in the paste buffer
	* plays a sound
	* shows a notification

## sfs_screenshot.sh
A simple script to take a screenshot and save it to a temporary file and output the filename to stdout so sfs_upload.py can be used to upload it.