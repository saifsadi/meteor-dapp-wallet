# Expanse Wallet Ðapp

The Expanse wallet. 
This project is based on [Ethereum Wallet Ðapp](https://github.com/ethereum/meteor-dapp-wallet) and has been extended by the expanse project.

**NOTE** The wallet is not yet official released,
can contain severe bugs!


## Development

Start an `gexp` node and and the app using meteor and open http://localhost:3000 in your browser:

    $ gexp --rpccorsdomain "http://localhost:3000" --rpc --unlock <your account>

Starting the wall dapp using [Meteor](http://meteor.com/install)

    $ cd meteor-dapp-wallet/app
    $ meteor

Go to http://localhost:3000


## Deployment

To create a build version of your app run:
    
    // install meteor-build-client
    $ npm install -g meteor-build-client

    // bundle dapp
    $ cd meteor-dapp-wallet/app
    $ meteor-build-client ../build --path "/"

This will generate the files in the `../build` folder. Double click the index.html to start the app.
To make routing work properly you need to build it using:

    $ meteor-build-client ../build

And start a local server which points with its document root into the `../build` folder,
so that you can open the app using `http://localhost:80/`

***

## Gas usage statistics

- Deploy original wallet: 1 230 162
- Deploy wallet stub: 184 280
- Simple Wallet transaction: 64 280
- Multisig Wallet transaction below daily limit: 79 280
- Multisig Wallet transaction above daily limit: 171 096
- 1 Multisig confirmation: 48 363