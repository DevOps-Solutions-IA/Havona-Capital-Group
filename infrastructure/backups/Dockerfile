FROM postgres:16-alpine
COPY infrastructure/backups/backup-postgres.sh /usr/local/bin/backup-postgres
COPY infrastructure/backups/restore-postgres.sh /usr/local/bin/restore-postgres
RUN chmod 0555 /usr/local/bin/backup-postgres /usr/local/bin/restore-postgres
ENTRYPOINT ["/usr/local/bin/backup-postgres"]
