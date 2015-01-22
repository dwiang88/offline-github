(function() {

function IssuesListController ($http, $scope, $routeParams, db,
    lovefieldQueryBuilder, mockIssues, firebaseAuth) {
  var ITEMS_PER_PAGE = 30;
  var observeQuery;
  var queryStartTime = performance.now();
  var table = db.getSchema().getIssues();

  $scope.issues = [];
  $scope.$on('$locationChangeStart', updateQueryAndSubscription);

  getAndRenderIssues(db).
    then(countPages).
    then(subscribeToIssues);//.
    // then(buildUpdateUrl);//.
    // then(updateIssuesCache);

  $scope.$on('$destroy', unobserve);


  function updateQueryAndSubscription(page,state,search) {
    unobserve().
      then(getAndRenderIssues).
      then(countPages).
      then(subscribeToIssues);
  }

  function getStandardQuery() {
    var predicate = lovefieldQueryBuilder({
      repository: $routeParams.repo,
      organization: $routeParams.org
    });
    var pageNum = angular.isDefined($routeParams.page) ? parseInt($routeParams.page, 10) : 0;

    //Get initial value

    var query = db.
      select().
      from(table).
      limit(ITEMS_PER_PAGE);

    if(pageNum) {
      //Skip throws if passed a zero
      query = query.
        skip(pageNum * ITEMS_PER_PAGE);
    }

    query.where(predicate);

    return query;
  }

  function getCountQuery() {
    var predicate = lovefieldQueryBuilder({
      repository: $routeParams.repo,
      organization: $routeParams.org
    });
    return db.
      select(lf.fn.count(table.id)).
      from(table).
      where(predicate);
  }

  function unobserve () {
    if (observeQuery) {
      db.unobserve(observeQuery, updateData);
      observeQuery = null;
    }
    return Promise.resolve(db);
  }

  function countPages(db) {
    getCountQuery().
      exec().
      then(function(count) {
        var pages = Math.ceil(count[0]['COUNT(id)'] / ITEMS_PER_PAGE);
        $scope.$apply(function(){
          $scope.pages=new Array(pages);
        });
      });

    return db;
  }

  function getAndRenderIssues(db) {
    getStandardQuery().
      exec().
      then(renderData);

    return Promise.resolve(db);
  }

  function subscribeToIssues(db) {
    var predicate = lovefieldQueryBuilder({
      repository: $routeParams.repo,
      organization: $routeParams.org
    });
    observeQuery = db.select().from(table).where(predicate)

    //Stay abreast of further updates
    db.observe(observeQuery, updateData);
    return db;
  }

  function insertFakeData(db) {
    var issuesInsert = mockIssues().map(function(issue) {
      return table.createRow(issueStorageTranslator(issue));
    });
    db.insertOrReplace().into(table).values(issuesInsert).exec();
    return db;
  }

  function buildUpdateUrl() {
    return 'https://api.github.com/repos/'+
      $routeParams.org+
      '/'+
      $routeParams.repo+
      '/issues?'+
      'per_page=100&'+
      'state=all&'+
      'access_token='+
      firebaseAuth.getAuth().github.accessToken;
  }

  function updateIssuesCache(url) {
    $http.get(url).
      then(insertData).
      then(function(res) {
        var nextPage = getNextPageUrl(res);
        if (nextPage) updateIssuesCache(nextPage);
      }).
      then(null, showError);
  }

  function insertData(res) {
    var issuesInsert = res.data.map(function(issue) {
      return table.createRow(issueStorageTranslator(issue));
    });
    db.insertOrReplace().into(table).values(issuesInsert).exec();

    return res;
  }

  function getNextPageUrl (res) {
    var linkHeader = res.headers('link')
    if (!linkHeader) return undefined;
    var firstLinkTuple = linkHeader.
      split(', ')[0].
      split('; rel=');
    if (firstLinkTuple[1].replace(/"/g,'') === 'next') {
      return firstLinkTuple[0].replace(/[<>]*/g, '');
    }
  }

  function showError() {
    $scope.error = 'Could not update issues from server';
  }

  function renderData(issues) {
    $scope.$apply(function() {
      $scope.issues = issues;
    })
    console.log('total query plus render time: ', performance.now() - queryStartTime)
  }

  //TODO: make this more efficient
  function updateData (changes) {
    $scope.$apply(function() {
      $scope.issues = changes[0].object;
    })
  }


  function issueStorageTranslator(issue){
    /*jshint camelcase: false */
    var newIssue = angular.copy(issue);
    newIssue.assignee = issue.assignee || -1;
    newIssue.milestone = issue.milestone || -1;
    newIssue.created_at = new Date(issue.created_at);
    newIssue.updated_at = new Date(issue.updated_at);
    return newIssue;
  };
}

angular.module('ghIssuesApp').
  controller(
      'IssuesListController',
      ['$http', '$scope', '$routeParams', 'db', 'lovefieldQueryBuilder',
          'mockIssues', 'firebaseAuth', IssuesListController]);

}());
