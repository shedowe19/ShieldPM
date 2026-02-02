#!/bin/bash -e
# Stage prerun - runs before all substages
# This copies the rootfs from the previous stage (stage2)

if [ ! -d "${PREV_ROOTFS_DIR}" ]; then
    echo "ERROR: Previous rootfs not found at ${PREV_ROOTFS_DIR}"
    exit 1
fi

echo "=== Copying rootfs from stage2 ==="
rsync -aH --info=progress2 "${PREV_ROOTFS_DIR}/" "${ROOTFS_DIR}/"

echo "=== ShieldPM Stage: Preparing Raspberry Pi 4 Image ==="
