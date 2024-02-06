const passport =require('facebook')
const FacebookStrategy =require('passport-facebook').Strategy

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_SECRET_KEY,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL,
    },
    async function (accessToken, refreshToken, profile, cb) {
      const user = await User.findOne({
        accountId: profile.id,
        provider: 'facebook',
      });
      if (!user) {
        console.log('Adding new facebook user to DB..');
        const user = new User({
          accountId: profile.id,
          name: profile.displayName,
          provider: profile.provider,
        });
        await user.save();
        // console.log(user);
        return cb(null, profile);
      } else {
        console.log('Facebook User already exist in DB..');
        // console.log(profile);
        return cb(null, profile);
      }
    }
  )
);