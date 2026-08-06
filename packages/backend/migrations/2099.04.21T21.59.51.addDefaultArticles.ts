import { Migration } from '../migrate.js'
import { InteractionControl } from '../models/post.js'
import { Post, User } from '../models/index.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { Privacy } from '../models/post.js'

export const up: Migration = async (params) => {
  let adminUser = await User.findOne({
    where: {
      url: completeEnvironment.adminUser
    }
  })

  if (adminUser) {
    let content = `<h2>Wafrn, the social media that respects you</h2>
<p>Welcome to this Wafrn instance, a federated social media inspired by Tumblr that connects with the Fediverse and Bluesky.</p>
<p><br></p>
<p>To fully enjoy this hellsite, please consider joining us: <a href="/register" rel="noopener noreferrer" target="_blank">register into wafrn!</a></p>
<p><br></p>
<p><br></p>
<p>Bring your twisted ideas onto others, share recipies of cake that swap the flour for mayo or hot sauce!</p>
<p><br></p>
<p>Consider <a href="/register" rel="noopener noreferrer" target="_blank">joining Wafrn</a>!</p>`

    await Post.upsert(
      {
        userId: adminUser.id,
        slug: 'system.welcome',
        content: content,
        markdownContent: content,
        content_warning: '',
        privacy: Privacy.LinkOnly,
        hierarchyLevel: 0,
        likeControl: InteractionControl.NoOne,
        reblogControl: InteractionControl.NoOne,
        quoteControl: InteractionControl.NoOne,
        replyControl: InteractionControl.NoOne
      },
      {
        conflictFields: ['userId', 'slug']
      }
    )

    content = `<h2>Wafrn, the social media that respects you</h2>
<p>This website is running Wafrn, a federated social media inspired by Tumblr that connects with both the Fediverse and Bluesky</p>
<p>The instance is managed by <a href="/blog/${adminUser.url}">${adminUser.url}</a></p>
<h2>Regarding our privacy policy:</h2>
<p>We will check your ip against a well known vpn checking service, to avoid abuse.</p>
<p>We do not use third party cookies nor third party analytic tools.</p>
<p>Regarding what we will do with your data:</p>
<p>* We are connected with other social networks, so your posts and your images could be automatically stored in other servers. Your URL, your blog name and your avatar are public information. Your birth date, email and password are private and only get stored in our server.</p>
<p>* If you chose to enable bluesky <a href="/profile/enable-bluesky">here</a>, the post you publish marked as public will also go to bluesky, another decentralized(ish at the moment of writing) social network.</p>
<p>* We will store your email and every once in a while send you a small campaign so you come back and commit some shitposts (please. please, do commit more shitposts).</p>
<p>* We need your birth date for legal reasons. Mostly to verify that you are older than 18 for safety reasons</p>
<p>* We will also store your registration IP, your last login IP and the IP that you use when you upload an attachment.</p>
<p>* If your account does not get activated in a period between a month and a year it might get deleted.</p>
<p>* If you want to get all the data we have about you, or there is any problem regarding the GDPR please send a message to the <a href="/blog/${adminUser.url}">site administrator</a>. This is a manual process and can take some time.</p>
<h2>Rules</h2>
<p>* Don't be a Nazi asshole. Don't harass other people. Put CW on adult things and go nuts, make nuts, show nuts. This project is a hobby project. Do not get the police on my doorstep.</p>
<p>* You can upload spicy art. Just mark it as such. Regarding "adult like characters and child like characters in spicy art" the answer is no.</p>
<p>* Do not give me a huge headache repeatedly</p>`

    await Post.upsert(
      {
        userId: adminUser.id,
        slug: 'system.about',
        content: content,
        markdownContent: content,
        content_warning: '',
        privacy: Privacy.LinkOnly,
        hierarchyLevel: 0,
        likeControl: InteractionControl.NoOne,
        reblogControl: InteractionControl.NoOne,
        quoteControl: InteractionControl.NoOne,
        replyControl: InteractionControl.NoOne
      },
      {
        conflictFields: ['userId', 'slug']
      }
    )

    content = `<h1>Privacy Policy</h1>
<p>This privacy policy describes how ${completeEnvironment.instanceUrl}
("${completeEnvironment.instanceUrl}", "we", "us") collects,
protects and uses the personally identifiable information you may provide
through ${completeEnvironment.instanceUrl} or its API. The policy also describes the choices
available to you regarding our use of your personal information and how you can
access and update this information. This policy does not apply to the practices
of companies that ${completeEnvironment.instanceUrl} does not own or control, or to individuals that
${completeEnvironment.instanceUrl} does not employ or manage.</p>
<h2>What information do we collect?</h2>
<ul>
<li><strong>Basic account information</strong>: If you register on this server, you may be
asked to enter a username, an e-mail address and a password. You may also
enter additional profile information such as a display name and biography, and
upload a profile picture and header image. The username, display name,
biography, profile picture and header image are always listed publicly.</li>
<li><strong>Personal details</strong>: During registration we ask about your birthday,
to verify that you comply with our "Site usage by children" policies set below.</li>
<li><strong>Posts, following and other public information</strong>: The list of people you
follow is listed publicly, the same is true for your followers. When you
submit a message, the date and time is stored as well as the application you
submitted the message from. Messages may contain media attachments, such as
pictures and videos. Public and unlisted posts are available publicly. When
you feature a post on your profile, that is also publicly available
information. Your posts are delivered to your followers, in some cases it
means they are delivered to different servers and copies are stored there.
When you delete posts, this is likewise delivered to your followers. The
action of reblogging or favouriting another post is always public.</li>
<li><strong>Direct and followers-only posts</strong>: All posts are stored and
processed on the server. Followers-only posts are delivered to your followers and users
who are mentioned in them, and direct posts are delivered only to users mentioned in
them. In some cases it means they are delivered to different servers and
copies are stored there. We make a good faith effort to limit the access to
those posts only to authorized persons, but other servers may fail to do so.
Therefore it's important to review servers your followers belong to. You may
toggle an option to approve and reject new followers manually in the settings.
<strong>Please keep in mind that the operators of the server and any receiving
server may view such messages</strong>, and that recipients may screenshot, copy or
otherwise re-share them. <strong>Do not share any sensitive information over
Wafrn.</strong></li>
<li><strong>Bluesky integration</strong>: Wafrn lets you connect to both the
Fediverse and Bluesky, the latter being opt-in. If you however do enable Bluesky
integration please note posts you create on the Bluesky network will be subject to
the <a href="https://bsky.social/about/support/network-services-privacy-policy">
Bluesky AT Protocol Network Services Privacy Notice</a> as well.</li>
<li><strong>IPs and other metadata</strong>: When you register, we record the
IP address you log in from, and check it against well known VPN locations.
We also may retain server logs which include the IP address of every request
to our server.</li>
</ul>
<h2>What do we use your information for?</h2>
<p>Any of the information we collect from you may be used in the following ways:</p>
<ul>
<li>To provide the core functionality of Wafrn. You can only interact with
other people's content and post your own content when you are logged in. For
example, you may follow other people to view their combined posts in your own
personalized home timeline.</li>
<li>To aid moderation of the community, for example comparing your IP address with
other known ones to determine ban evasion or other violations.</li>
<li>The email address you provide may be used to send you information,
notifications about other people interacting with your content or sending you
messages, and to respond to inquiries, and/or other requests or questions.</li>
</ul>
<h2>How do we protect your information?</h2>
<p>We implement a variety of security measures to maintain the safety of your
personal information when you enter, submit, or access your personal
information. Among other things, your browser session, as well as the traffic
between your applications and the API, are secured with SSL, and your password
is hashed using a strong one-way algorithm. You may enable two-factor
authentication to further secure access to your account.</p>
<h2>What is our data retention policy?</h2>
<p>We will make a good faith effort to:</p>
<ul>
<li>Retain server logs containing the IP address of all requests to this server,
in so far as such logs are kept, no more than 90 days.</li>
<li>Retain the IP addresses associated with registered users no more than 12
months.</li>
</ul>
<p>You can request and download an archive of your content, including your posts,
media attachments, profile picture, and header image by sending a request to the
site administrator.</p>
<p>You may irreversibly delete your account at any time.</p>
<h2>Do we use cookies?</h2>
<p>Yes. Cookies are small files that a site or its service provider transfers to
your computer's hard drive through your Web browser (if you allow). These
cookies enable the site to recognize your browser and, if you have a registered
account, associate it with your registered account.</p>
<p>We use cookies to understand and save your preferences for future visits.</p>
<h2>Do we disclose any information to outside parties?</h2>
<p>We do not sell, trade, or otherwise transfer to outside parties your personally
identifiable information. This does not include trusted third parties who assist
us in operating our site, conducting our business, or servicing you, so long as
those parties agree to keep this information confidential. We may also release
your information when we believe release is appropriate to comply with the law,
enforce our site policies, or protect ours or others rights, property, or
safety.</p>
<p>Your public content may be downloaded by other servers in the network. Your
public and followers-only posts are delivered to the servers where your
followers reside, and direct messages are delivered to the servers of the
recipients, in so far as those followers or recipients reside on a different
server than this.</p>
<h2>Site usage by children</h2>
<p>If this server is in the EU or the EEA: Our site, products and services are all
directed to people who are at least 16 years old. If you are under the age of
16, per the requirements of the GDPR (General Data Protection Regulation) do not
use this site.</p>
<p>If this server is in the USA: Our site, products and services are all directed
to people who are at least 13 years old. If you are under the age of 13, per the
requirements of COPPA (Children's Online Privacy Protection Act) do not use this
site.</p>
<p>Law requirements can be different if this server is in another jurisdiction.</p>
<hr>
<p>This document is CC-BY-SA. Originally adapted from the
<a href="https://github.com/discourse/discourse">Discourse</a> and
<a href="https://mastodon.scot/privacy-policy">Mastodon</a> privacy policies.</p>`

    await Post.upsert(
      {
        userId: adminUser.id,
        slug: 'system.privacy-policy',
        content: content,
        markdownContent: content,
        content_warning: '',
        privacy: Privacy.LinkOnly,
        hierarchyLevel: 0,
        likeControl: InteractionControl.NoOne,
        reblogControl: InteractionControl.NoOne,
        quoteControl: InteractionControl.NoOne,
        replyControl: InteractionControl.NoOne
      },
      {
        conflictFields: ['userId', 'slug']
      }
    )
  }
}

export const down: Migration = async (params) => {
  let adminUser = await User.findOne({
    where: {
      url: completeEnvironment.adminUser
    }
  })

  if (adminUser) {
    await Post.destroy({
      where: {
        userId: adminUser.id,
        slug: 'system.privacy-policy'
      }
    })

    await Post.destroy({
      where: {
        userId: adminUser.id,
        slug: 'system.about'
      }
    })

    await Post.destroy({
      where: {
        userId: adminUser.id,
        slug: 'system.welcome'
      }
    })
  }
}
