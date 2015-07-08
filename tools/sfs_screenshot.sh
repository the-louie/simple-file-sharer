#! /bin/sh

# capture screen to a temporary file and output filename
TMPF=$(mktemp -d -t sfs)"/sfs_"$(date -j +"%Y%m%d%H%M%S")".jpg"
screencapture -ix "${TMPF}" >/dev/null
/bin/echo -n "${TMPF}"