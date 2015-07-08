#! /bin/sh
#
# this script takes the output from sfs_upload.py
#
# on success add the url to the copy-buffer, play a sound and display a notification
# on failure just play a sound and display a notification
#

type=$1
state=$2
msg=$3
url=$4

if [ "$state" = "FAIL" ]; then
	/usr/bin/osascript -e "display notification \"Upload to filedrop failed\" with title \"Filedrop failed\" subtitle \"($msg)\"" >/dev/null 2>&1
	/usr/bin/afplay /System/Library/Sounds/Basso.aiff >/dev/null 2>&1
else
	/bin/echo -n "$url" | /usr/bin/pbcopy >/dev/null 2>&1
	/usr/bin/osascript -e "display notification \"The filedrop URL are on your clipboard\" with title \"Filedrop successfull\" subtitle \"($msg)\"" >/dev/null 2>&1
	/usr/bin/afplay /System/Library/Sounds/Purr.aiff >/dev/null 2>&1
fi

