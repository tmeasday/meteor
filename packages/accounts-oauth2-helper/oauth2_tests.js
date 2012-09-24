Tinytest.add("oauth2 - loginResultForState is stored", function (test) {
  var http = __meteor_bootstrap__.require('http');
  var foobookId = Meteor.uuid();

  // XXX XXX test isolation fail!  Avital: but actually -- why would
  // we run server tests more than once? or even more so in parallel?
  Meteor.accounts._loginTokens.remove({});
  Meteor.accounts.oauth._loginResultForState = {};
  Meteor.accounts.oauth._services = {};

  if (!Meteor.accounts.configuration.findOne({service: 'foobook'}))
    Meteor.accounts.configuration.insert({service: 'foobook'});
  Meteor.accounts.foobook = {};

  // register a fake login service - foobook
  Meteor.accounts.oauth.registerService("foobook", 2, function (query) {
    return {
      options: {
        services: {foobook: {id: foobookId}}
      }
    };
  });

  // simulate logging in using foobook
  var req = {method: "POST",
             url: "/_oauth/foobook?close",
             query: {state: "STATE"}};
  Meteor.accounts.oauth._middleware(req, new http.ServerResponse(req));

  // verify that a user is created
  var user = Meteor.users.findOne({"services.foobook.id": foobookId});
  test.notEqual(user, undefined);
  test.equal(user.services.foobook.id, foobookId);

  // and that that user has a login token
  var token = Meteor.accounts._loginTokens.findOne({userId: user._id});
  test.notEqual(token, undefined);

  // and that the login result for that user is prepared
  test.equal(
    Meteor.accounts.oauth._loginResultForState['STATE'].id, user._id);
  test.equal(
    Meteor.accounts.oauth._loginResultForState['STATE'].token, token._id);
});


Tinytest.add("oauth2 - error in user creation", function (test) {
  var http = __meteor_bootstrap__.require('http');
  var state = Meteor.uuid();
  var failbookId = Meteor.uuid();

  if (!Meteor.accounts.configuration.findOne({service: 'failbook'}))
    Meteor.accounts.configuration.insert({service: 'failbook'});
  Meteor.accounts.failbook = {};

  // register a failing login service
  Meteor.accounts.oauth.registerService("failbook", 2, function (query) {
    return {
      options: {
        services: {failbook: {id: failbookId}}
      },
      extra: {
        invalid: true
      }
    };
  });

  // a way to fail new users. duplicated from passwords_tests, but
  // shouldn't hurt.
  Meteor.accounts.validateNewUser(function (user) {
    return !user.invalid;
  });

  // simulate logging in with failure
  Meteor._suppress_log(1);
  var req = {method: "POST",
             url: "/_oauth/failbook?close",
             query: {state: state}};
  Meteor.accounts.oauth._middleware(req, new http.ServerResponse(req));

  // verify that a user is not created
  var user = Meteor.users.findOne({"services.failbook.id": failbookId});
  test.equal(user, undefined);

  // verify an error is stored in login state
  test.equal(Meteor.accounts.oauth._loginResultForState[state].error, 403);

  // verify error is handed back to login method.
  test.throws(function () {
    Meteor.apply('login', [{oauth: {version: 2, state: state}}]);
  });

});


