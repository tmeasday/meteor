(function () {
  var connect = __meteor_bootstrap__.require("connect");

  // A place to store request tokens pending verification
  Meteor.accounts.oauth1._requestTokens = {};

  // connect middleware
  Meteor.accounts.oauth1._handleRequest = function (service, query, res) {

    var config = Meteor.accounts.configuration.findOne({service: service.serviceName});
    if (!config) {
      throw new Meteor.accounts.ConfigError("Service " + service.serviceName + " not configured");
    }

    var urls = Meteor.accounts[service.serviceName]._urls;
    var oauthBinding = new OAuth1Binding(
      config.consumerKey, config.secret, urls);

    if (query.requestTokenAndRedirect) {
      // step 1 - get and store a request token

      // Get a request token to start auth process
      oauthBinding.prepareRequestToken(query.requestTokenAndRedirect);

      // Keep track of request token so we can verify it on the next step
      Meteor.accounts.oauth1._requestTokens[query.state] = oauthBinding.requestToken;

      // redirect to provider login, which will redirect back to "step 2" below
      var redirectUrl = urls.authenticate + '?oauth_token=' + oauthBinding.requestToken;
      res.writeHead(302, {'Location': redirectUrl});
      res.end();

    } else {
      // step 2, redirected from provider login - complete the login
      // process: if the user authorized permissions, get an access
      // token and access token secret and log in as user

      // Get the user's request token so we can verify it and clear it
      var requestToken = Meteor.accounts.oauth1._requestTokens[query.state];
      delete Meteor.accounts.oauth1._requestTokens[query.state];

      // Verify user authorized access and the oauth_token matches
      // the requestToken from previous step
      if (query.oauth_token && query.oauth_token === requestToken) {

        // Prepare the login results before returning.  This way the
        // subsequent call to the `login` method will be immediate.

        // Get the access token for signing requests
        oauthBinding.prepareAccessToken(query);

        // Get or create user id
        var oauthResult = service.handleOauthRequest(oauthBinding);
        var userId = Meteor.accounts.updateOrCreateUser(
          oauthResult.options, oauthResult.extra);

        // Generate and store a login token for reconnect
        // XXX this could go in accounts_server.js instead
        var loginToken = Meteor.accounts._loginTokens.insert({userId: userId});

        // Store results to subsequent call to `login`
        Meteor.accounts.oauth._loginResultForState[query.state] =
          {token: loginToken, id: userId};
      }
    }

    // Either close the window, redirect, or render nothing
    // if all else fails
    Meteor.accounts.oauth._renderOauthResults(res, query);
  };

})();
