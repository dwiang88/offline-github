console.log('time at start of WebWorker', performance.now());
window = self;
importScripts('../../lovefield.js');
importScripts('../../db/github_db_gen.js');

var db;
var startGettingDb = performance.now();
var dbPromise = github.db.getInstance().then(function(_db_) {
  console.log('db instance loaded time', performance.now());
  console.log('db instance delta', performance.now() - startGettingDb);
  db = _db_;
  console.log('postMessage at ', performance.now());
  postMessage('dbInstance.success');
  return _db_;
}, function(e) {
  postMessage('dbInstance.error');
});

onmessage = function(msg) {
  console.log('message received timestamp: ', performance.now());
  switch(msg.data.operation) {
    case 'query.exec':
      Promise.resolve(dbPromise).then(function(db) {
        var queryContext = new QueryContext(msg.data.query.tableName, msg.data.query);
        Promise.resolve(queryContext).
          then(getTable).
          then(setBaseQuery).
          then(setPredicate).
          then(paginate).
          then(orderBy).
          then(execQuery).
            then(function(queryContext) {
              console.log('timestamp', performance.now());
              postMessage({
                queryId: msg.data.queryId,
                operation: 'query.success',
                results: queryContext.results
              });
            },
            function(queryContext) {
              postMessage({
                queryId: msg.data.queryId,
                operation: 'query.error',
                error: queryContext.error
              });
            });
          });
      break;
    case 'count.exec':
      Promise.resolve(dbPromise).then(function(db) {
        var queryContext = new CountQueryContext(msg.data.query.tableName, msg.data.query);
        Promise.resolve(queryContext).
          then(getTable).
          then(setCountQuery).
          then(setPredicate).
          then(execQuery).
          then(function(queryContext) {
            console.log('timestamp', performance.now());
            postMessage({
              queryId: msg.data.queryId,
              operation: 'count.success',
              results: queryContext.results
            });
          },
          function(queryContext) {
            console.log('something went wrong :(', queryContext)
            postMessage({
              queryId: msg.data.queryId,
              operation: 'count.error',
              error: queryContext.error
            });
          });
      });
      break;
  }

}

function QueryContext(tableName, query) {
  this.tableName = tableName;
  this.rawQueryPredicate = query.predicate;
  this.table = null;
  this.predicate = null;
  this.select = query.select || [];
  this.skip = query.skip;
  this.limit = query.limit;
  this.query = null;
  this.orderByColumn = query.orderByColumn;
  this.orderByDirection = query.orderByDirection;
}

function CountQueryContext(tableName, query) {
  this.tableName = tableName;
  this.rawQueryPredicate = query.predicate;
  this.table = null;
  this.predicate = null;
  this.column = query.column;
}

function getTable(queryContext) {
  console.log('getTable timestamp: ', performance.now());
  queryContext.table = db.getSchema()['get'+queryContext.tableName]();
  return queryContext;
}

function setBaseQuery (queryContext) {
  console.log('setBaseQuery timestamp: ', performance.now());
  var mapped = queryContext.select.map(function(select) {
    var select = queryContext.table[select];
    return select;
  });
  try {
    queryContext.query = db.select.apply(db, mapped).
      from(queryContext.table);
  } catch (e) {
  }
  return queryContext;
}

function setCountQuery (queryContext) {
  queryContext.query = db.
    select(lf.fn.count(queryContext.table[queryContext.column])).
    from(queryContext.table);
  return queryContext;
}

function setPredicate(queryContext) {
  console.log('setPredicate timestamp: ', performance.now());
  try {
    queryContext.predicate = predicateBuilder(queryContext.table, queryContext.rawQueryPredicate);
    queryContext.query = queryContext.query.where(queryContext.predicate);
  } catch (e) {
  }

  return queryContext;
}

function paginate (queryContext) {
  console.log('paginate timestamp: ', performance.now());
  if (queryContext.skip && queryContext.limit) {
    queryContext.query = queryContext.query.limit(queryContext.limit).
    skip(queryContext.skip);
  } else {
  }

  return queryContext;
}

function orderBy (queryContext) {
  if (queryContext.orderByColumn && queryContext.orderByDirection) {
    queryContext.query = queryContext.query.orderBy(
        queryContext.table[queryContext.orderByColumn],
        queryContext.orderByDirection);
  } else if (queryContext.orderByColumn) {
    queryContext.query = queryContext.query.orderBy(
        queryContext.table[queryContext.orderByColumn]);
  }

  return queryContext;
}

function execQuery(queryContext) {
  console.log('execQuery timestamp: ', performance.now());
  var startTime = performance.now();
  return queryContext.query.exec().then(function(results) {
    console.log('query time inside worker', performance.now() - startTime)
    console.log('exec done timestamp', performance.now())
    queryContext.results = results;
    return queryContext;
  }, function(e) {
    queryContext.error = e;
    return Promise.reject(queryContext);
  });
}

function predicateBuilder(schema, query){
  var normalizedQuery = [];
  var count = 0;
  for (var key in query) {
    if (query.hasOwnProperty(key) && schema[key]) {
      count++
      normalizedQuery.push(schema[key].eq(query[key]));
    }
  }

  if (!count) {
    return;
  }
  else if (count === 1) {
    return normalizedQuery[0];
  }
  else {
    return lf.op.and.apply(null, normalizedQuery);
  }
};