angular.module('ghoCacheModel', ['ghoDBService']).
  factory('CacheModel', ['$http', '$q', 'dbService', 'urlExpMerger', 'qAny', function($http, $q, dbService, urlExpMerger, qAny) {
    function CacheModel(localSchemaName, remoteUrlExp){
      this.localSchemaName = localSchemaName;
      this.remoteUrlExp = remoteUrlExp;
    };

    CacheModel.prototype.dbQuery = function dbQuery(query) {
      var self = this;
      return dbService.get().then(function(db) {
        var schema = db.getSchema()['get'+self.localSchemaName]();

        return db.
          select().
          from(schema).
          where(
            lf.op.and(
              schema.repository.eq(query.repository),
              schema.owner.eq(query.owner))
          ).
          exec().
          then(function(res) {
            if (res && res.length) {
              return res;
            }

            return $q.defer().promise;
          });
      });
    };

    CacheModel.prototype.httpQuery = function httpQuery(query) {
      return $http.get(urlExpMerger(this.remoteUrlExp, query));
    };

    CacheModel.prototype.query = function query(query) {
      return qAny([
          this.dbQuery(query),
          this.httpQuery(query)
      ]);
    };

    return CacheModel;
  }]).
  factory('qAny', ['$q', function($q){
    return function qAny(promises){
      var resolved;
      var deferred = $q.defer();
      promises.forEach(function(promise) {
        promise.then(resolveIfNot);
      });

      function resolveIfNot (val) {
        if (!resolved) {
          resolved = true;
          return deferred.resolve(val);
        }
      }
      return deferred.promise;
    };
  }]).
  factory('urlExpMerger', [function(){
    return function urlExpMerger(exp, values){
      var retVal = exp;
      while (match = /((?:\:)[a-z]+)/g.exec(retVal)) {
        retVal = retVal.replace(match[0], values[match[0].replace(':','')]);
      }
      return retVal;
    };
  }]);
