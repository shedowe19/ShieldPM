#!/bin/bash -e
# Stage prerun - copy rootfs from previous stage if not exists

if [ ! -d "${ROOTFS_DIR}" ]; then
    copy_previous
fi
