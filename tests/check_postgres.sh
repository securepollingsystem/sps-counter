# chmod 600 ~/.pgpass # https://www.postgresql.org/docs/current/libpq-pgpass.html
PGPASS=$(cat ~/.pgpass) || exit 9
PGSERVER=$(echo $PGPASS | cut -d: -f1) || exit 9
PGPORT=$(echo $PGPASS | cut -d: -f2) || exit 9
PGDBNAME=$(echo $PGPASS | cut -d: -f3) || exit 9
PGUSERNAME=$(echo $PGPASS | cut -d: -f4) || exit 9
echo -n 'connecting to counter postgreSQL server to query number of unique opinions held; '
echo '\x \\ SELECT COUNT(*) FROM sps.opinions;' | psql -h $PGSERVER -p $PGPORT -d $PGDBNAME -U $PGUSERNAME # works with ~/.pgpass
