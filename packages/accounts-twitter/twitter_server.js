(function () {

  Meteor.accounts.oauth.registerService('twitter', 1, function(oauthBinding) {
    var identity = oauthBinding.get('https://api.twitter.com/1/account/verify_credentials.json');

    return {
      options: {
        services: {
          twitter: {
            id: identity.id,
            screenName: identity.screen_name,
            accessToken: oauthBinding.accessToken,
            accessTokenSecret: oauthBinding.accessTokenSecret
          }
        }
      },
      extra: {
        profile: {
          name: identity.name
        }
      }
    };
  });
}) ();
