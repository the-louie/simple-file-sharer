These scripts are made for use in Apple Automator workflows. But can probably be reused in a multitude of ways.

## sfs_upload.py
Upload files from commandline, primary for use with Apple workflow.

## osx-helper.sh
If sfs_upload.py is used with Apple Automator this takes the output from the script and:
* puts the url in the paste buffer
* plays a sound
* shows a notification

## sfs_screenshot.sh
A simple script to take a screenshot and save it to a temporary file that sfs_upload.py can upload.