# capture screen and print filename
TMPF=$(mktemp -d -t sfs)"/sfs_"$(date -j +"%Y%m%d%H%M%S")".jpg"
screencapture -ix "${TMPF}"
/bin/echo -n "${TMPF}"