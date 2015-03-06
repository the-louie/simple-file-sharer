type=$1
state=$2
msg=$3
url=$4

if [ "$state" = "FAIL" ]; then
	/bin/echo -n "Upload to filedrop failed :(" | pbcopy >/dev/null 2>&1
	osascript -e "display notification \"Upload to filedrop failed\" with title \"Filedrop failed\" subtitle \"($msg)\"" >/dev/null 2>&1
	/usr/local/bin/play /System/Library/Sounds/Basso.aiff >/dev/null 2>&1
else
	/bin/echo -n "$url" | pbcopy >/dev/null 2>&1
	osascript -e "display notification \"The filedrop URL are on your clipboard\" with title \"Filedrop successfull\" subtitle \"($msg)\"" >/dev/null 2>&1
	/usr/local/bin/play /System/Library/Sounds/Purr.aiff >/dev/null 2>&1
fi

