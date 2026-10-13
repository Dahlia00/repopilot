# INTENTIONALLY SYNTHETIC BENCHMARK FIXTURE; never execute.
def lookup(connection, name):
    query = "SELECT * FROM users WHERE name='" + name + "'"
    return connection.execute(query)
