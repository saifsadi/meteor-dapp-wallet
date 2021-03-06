/**
Template Controllers

@module Templates
*/

/**
The add user template

@class [template] views_send
@constructor
*/


/**
The default gas to provide for estimates. This is set manually,
so that invalid data etsimates this value and we can later set it down and show a warning,
when the user actually wants to send the dummy data.

@property defaultEstimateGas
*/
var defaultEstimateGas = 5000000;

/**
Check if the amount accounts daily limit  and sets the correct text.

@method checkOverDailyLimit
*/
var checkOverDailyLimit = function(address, wei, template){
    // check if under or over dailyLimit
    account = Helpers.getAccountByAddress(address);

    // check whats left
    var restDailyLimit = new BigNumber(account.dailyLimit || '0', 10).minus(new BigNumber(account.dailyLimitSpent || '0', 10));

    if(account && account.requiredSignatures > 1 && !_.isUndefined(account.dailyLimit) && account.dailyLimit !== ethereumConfig.dailyLimitDefault && Number(wei) !== 0) {
        if(restDailyLimit.lt(new BigNumber(wei, 10)))
            TemplateVar.set('dailyLimitText', new Spacebars.SafeString(TAPi18n.__('wallet.send.texts.overDailyLimit', {limit: ExpTools.formatBalance(restDailyLimit.toString(10)), total: ExpTools.formatBalance(account.dailyLimit), count: account.requiredSignatures - 1})));
        else
            TemplateVar.set('dailyLimitText', new Spacebars.SafeString(TAPi18n.__('wallet.send.texts.underDailyLimit', {limit: ExpTools.formatBalance(restDailyLimit.toString(10)), total: ExpTools.formatBalance(account.dailyLimit)})));
    } else
        TemplateVar.set('dailyLimitText', false);
};

/**
Get the data field of either the byte or source code textarea, depending on the selectedType

@method getDataField
*/
var getDataField = function(){
    // make reactive to the show/hide of the textarea
    TemplateVar.getFrom('.compile-contract','byteTextareaShown');

    var type = TemplateVar.getFrom('.compile-contract', 'selectedType');
        data = (type === 'byte-code')
        ? TemplateVar.getFrom('.dapp-data-textarea', 'value')
        : TemplateVar.getFrom('.compile-contract', 'value');

    return data;
};


/**
Gas estimation callback

@method estimationCallback
*/
var estimationCallback = function(e, res){
    var template = this;

    console.log('Estimated gas: ', res, e);

    if(!e && res) {
        TemplateVar.set(template, 'estimatedGas', res);

        // show note if its defaultEstimateGas, as the data is not executeable
        if(res === defaultEstimateGas)
            TemplateVar.set(template, 'codeNotExecutable', true);
        else
            TemplateVar.set(template, 'codeNotExecutable', false);
    }
};


// Set basic variables
Template['views_send'].onCreated(function(){
    var template = this;

    // SET THE DEFAULT VARIABLES
    TemplateVar.set('amount', '0');
    TemplateVar.set('estimatedGas', 0);
    TemplateVar.set('sendAll', false);


    // check if we are still on the correct chain
    Helpers.checkChain(function(error) {
        if(error && (EthAccounts.find().count() > 0)) {
            checkForOriginalWallet();
        }
    });


    // check daily limit again, when the account was switched
    template.autorun(function(c){
        var address = TemplateVar.getFrom('.dapp-select-account', 'value'),
            amount = TemplateVar.get('amount') || '0';

        if(!c.firstRun)
            checkOverDailyLimit(address, amount, template);
    });

    // change the amount when the currency unit is changed
    template.autorun(function(c){
        var unit = ExpTools.getUnit();

        if(!c.firstRun && TemplateVar.get('selectedToken') === 'expanse') {
            TemplateVar.set('amount', ExpTools.toWei(template.find('input[name="amount"]').value.replace(',','.'), unit));
        }
    });
});



Template['views_send'].onRendered(function(){
    var template = this;

    // focus address input field
    if(FlowRouter.getParam('address')) {
        this.find('input[name="to"]').value = FlowRouter.getParam('address');
        this.$('input[name="to"]').trigger('change');

    } else if(!this.data){
        this.$('input[name="to"]').focus();
    }

    // set the from
    var from = FlowRouter.getParam('from');
    if(from)
        TemplateVar.setTo('select[name="dapp-select-account"]', 'value', FlowRouter.getParam('from').toLowerCase());


    // ->> GAS PRICE ESTIMATION
    template.autorun(function(c){
        var address = TemplateVar.getFrom('.dapp-select-account', 'value'),
            to = TemplateVar.getFrom('.dapp-address-input .to', 'value'),
            amount = TemplateVar.get('amount') || '0',
            data = getDataField(),
            tokenAddress = TemplateVar.get('selectedToken');

        if(_.isString(address))
            address = address.toLowerCase();

        // console.log('DATA', data);


        // console.log('ESTIMATE for token', tokenAddress, {
        //             from: address,
        //             to: to,
        //             value: amount,
        //             data: data,
        //             gas: defaultEstimateGas
        //         },

        //         web3.eth.estimateGas({
        //             from: address,
        //             to: to,
        //             value: amount,
        //             data: data,
        //             gas: defaultEstimateGas
        //         }));

        // Ether tx estimation
        if(tokenAddress === 'expanse') {

            if(EthAccounts.findOne({address: address}, {reactive: false})) {
                web3.eth.estimateGas({
                    from: address,
                    to: to,
                    value: amount,
                    data: data,
                    gas: defaultEstimateGas
                }, estimationCallback.bind(template));

            // Wallet tx estimation
            } else if(wallet = Wallets.findOne({address: address}, {reactive: false})) {

                if(contracts['ct_'+ wallet._id])
                    contracts['ct_'+ wallet._id].execute.estimateGas(to || '', amount || '', data || '',{
                        from: wallet.owners[0],
                        gas: defaultEstimateGas
                    }, estimationCallback.bind(template));
            }

        // Custom coin estimation
        } else {

            TokenContract.at(tokenAddress).transfer.estimateGas(to, amount, {
                from: address,
                gas: defaultEstimateGas
            }, estimationCallback.bind(template));
        }
    });
});


Template['views_send'].helpers({
    /**
    React on the template data context

    @method (reactiveData)
    */
    'reactiveData': function(deployContract){

        // Deploy contract
        if(this && this.deployContract) {
            TemplateVar.set('selectedAction', 'deploy-contract');
            TemplateVar.set('selectedToken', 'expanse');
            TemplateVar.setTo('.compile-contract', 'selectedType', 'source-code');


        // Send funds
        } else {
            TemplateVar.set('selectedAction', 'send-funds');
            TemplateVar.set('selectedToken', FlowRouter.getParam('token') || 'expanse');
        }
    },
    /**
    Get the current selected account

    @method (selectedAccount)
    */
    'selectedAccount': function(){
        return Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account', 'value'));
    },
    /**
    Get the current selected token document

    @method (selectedToken)
    */
    'selectedToken': function(){
        return Tokens.findOne({address: TemplateVar.get('selectedToken')});
    },
    /**
    Retrun checked, if the current token is selected

    @method (tokenSelectedAttr)
    */
    'tokenSelectedAttr': function(token) {
        return (TemplateVar.get('selectedToken') === token)
            ? {checked: true}
            : {};
    },
    /**
    Get all tokens

    @method (tokens)
    */
    'tokens': function(){
        if(TemplateVar.get('selectedAction') === 'send-funds')
            return Tokens.find({},{sort: {name: 1}});
    },
    /**
    Checks if the current selected account has tokens

    @method (hasTokens)
    */
    'hasTokens': function() {
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account', 'value')),
            query = {};


        if(!selectedAccount)
            return;

        query['balances.'+ selectedAccount._id] = {$exists: true, $ne: '0'};   
     
        return (TemplateVar.get('selectedAction') === 'send-funds' && !!Tokens.findOne(query, {field: {_id: 1}}));
    },
    /**
    Show the byte code only for the data field

    @method (showOnlyByteTextarea)
    */
    'showOnlyByteTextarea': function() {
        return (TemplateVar.get("selectedAction") !== "deploy-contract");
    },
    /**
    Return the currently selected fee + amount

    @method (total)
    */
    'total': function(ether){
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account', 'value'));
        var amount = TemplateVar.get('amount');
        if(!_.isFinite(amount))
            return '0';

        // expanse
        var gasInWei = TemplateVar.getFrom('.dapp-select-gas-price', 'gasInWei') || '0';

        if (TemplateVar.get('selectedToken') === 'expanse') {
            amount = (selectedAccount && selectedAccount.owners)
                ? amount
                : new BigNumber(amount, 10).plus(new BigNumber(gasInWei, 10));
        } else {
            amount = new BigNumber(gasInWei, 10);
        }
        return amount;
    },
    /**
    Return the currently selected token amount

    @method (tokenTotal)
    */
    'tokenTotal': function(){
        var amount = TemplateVar.get('amount'),
            token = Tokens.findOne({address: TemplateVar.get('selectedToken')});

        if(!_.isFinite(amount) || !token)
            return '0';

        return Helpers.formatNumberByDecimals(amount, token.decimals);
    },
    /**
    Returns the total amount - the fee paid to send all expanse/coins out of the account

    @method (sendAllAmount)
    */
    'sendAllAmount': function(){
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account', 'value'));
        var amount = 0;

        if (TemplateVar.get('selectedToken') === 'expanse') {
            var gasInWei = TemplateVar.getFrom('.dapp-select-gas-price', 'gasInWei') || '0';

            // deduct fee if account, for contracts use full amount
            amount = (selectedAccount.owners)
                ? selectedAccount.balance
                : new BigNumber(selectedAccount.balance, 10).minus(new BigNumber(gasInWei, 10)).toString(10);
        } else {
            var token = Tokens.findOne({address: TemplateVar.get('selectedToken')});

            if(!token || !token.balances || !token.balances[selectedAccount._id])
                amount = '0';
            else
                amount = token.balances[selectedAccount._id];
        }

        TemplateVar.set('amount', amount);
        return amount;
    },
    /**
    Returns the decimals of the current token

    @method (tokenDecimals)
    */
    'tokenDecimals': function(){
        var token = Tokens.findOne({address: TemplateVar.get('selectedToken')});
        return token ? token.decimals : 0;
    },
    /**
    Returns the right time text for the "sendText".

    @method (timeText)
    */
    'timeText': function(){
        return TAPi18n.__('wallet.send.texts.timeTexts.'+ ((Number(TemplateVar.getFrom('.dapp-select-gas-price', 'feeMultiplicator')) + 5) / 2).toFixed(0));
    },
    /**

    Shows correct explanation for token type

    @method (sendExplanation)
    */
    'sendExplanation': function(){

        var amount = TemplateVar.get('amount') || '0',
            selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account', 'value')),
            token = Tokens.findOne({address: TemplateVar.get('selectedToken')});

        if(!token || !selectedAccount)
            return;

        return Spacebars.SafeString(TAPi18n.__('wallet.send.texts.sendToken', {
            amount: Helpers.formatNumberByDecimals(amount, token.decimals),
            name: token.name,
            symbol: token.symbol
        })); 
        
    },
    /**
    Get Balance of a token

    @method (formattedCoinBalance)
    */
    'formattedCoinBalance': function(e){
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account', 'value'));

        return (this.balances && Number(this.balances[selectedAccount._id]) > 0)
            ? Helpers.formatNumberByDecimals(this.balances[selectedAccount._id], this.decimals) +' '+ this.symbol
            : false;
    },
    /**
    Checks if the current selected account is a wallet contract

    @method (selectedAccountIsWalletContract)
    */
    'selectedAccountIsWalletContract': function(){
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account', 'value'));
        return selectedAccount ? !!selectedAccount.owners : false;
    },
    /**
    Clear amount from characters

    @method (clearAmountFromChars)
    */
    'clearAmountFromChars': function(amount){
        amount = (~amount.indexOf('.'))
            ? amount.replace(/\,/g,'')
            : amount;

        return amount.replace(/ /g,'');
    }
});


Template['views_send'].events({
    /**
    Send all funds
    
    @event change input.send-all
    */
    'change input.send-all': function(e){
        TemplateVar.set('sendAll', $(e.currentTarget)[0].checked);
        TemplateVar.set('amount', 0);
    },
    /**
    Select a token 
    
    @event click .token-ether
    */
    'click .token-ether': function(e, template){
        TemplateVar.set('selectedToken', 'expanse');

        // trigger amount box change
        template.$('input[name="amount"]').trigger('change');
    },
    /**
    Select a token 
    
    @event click .select-token
    */
    'click .select-token input': function(e, template){
        TemplateVar.set('selectedToken', e.currentTarget.value);

        // trigger amount box change
        template.$('input[name="amount"]').trigger('change');
    },
    /**
    Set the amount while typing
    
    @event keyup input[name="amount"], change input[name="amount"], input input[name="amount"]
    */
    'keyup input[name="amount"], change input[name="amount"], input input[name="amount"]': function(e, template){
        // expanse
        if(TemplateVar.get('selectedToken') === 'expanse') {
            var wei = ExpTools.toWei(e.currentTarget.value.replace(',','.'));

            TemplateVar.set('amount', wei || '0');

            checkOverDailyLimit(template.find('select[name="dapp-select-account"]').value, wei, template);
        
        // token
        } else {
            
            var token = Tokens.findOne({address: TemplateVar.get('selectedToken')}),
                amount = e.currentTarget.value || '0';

            amount = new BigNumber(amount, 10).times(Math.pow(10, token.decimals || 0)).floor().toString(10);

            TemplateVar.set('amount', amount);
        }
    },
    /**
    Submit the form and send the transaction!
    
    @event submit form
    */
    'submit form': function(e, template){

        var amount = TemplateVar.get('amount') || '0',
            tokenAddress = TemplateVar.get('selectedToken'),
            to = TemplateVar.getFrom('.dapp-address-input .to', 'value'),
            gasPrice = TemplateVar.getFrom('.dapp-select-gas-price', 'gasPrice'),
            estimatedGas = TemplateVar.get('estimatedGas'),
            selectedAccount = Helpers.getAccountByAddress(template.find('select[name="dapp-select-account"]').value),
            selectedAction = TemplateVar.get("selectedAction"),
            data = getDataField(),
            contract = TemplateVar.getFrom('.compile-contract', 'contract'),
            sendAll = TemplateVar.get('sendAll');

        if(selectedAccount && !TemplateVar.get('sending')) {

            // set gas down to 21 000, if its invalid data, to prevent high gas usage.
            if(estimatedGas === defaultEstimateGas || estimatedGas === 0)
                estimatedGas = 21000;

            // if its a wallet contract and tokens, don't need to remove the gas addition on send-all, as the owner pays
            if(sendAll && (selectedAccount.owners || tokenAddress !== 'expanse'))
                sendAll = false;


            console.log('Providing gas: ', estimatedGas , sendAll ? '' : ' + 100000');

            if(TemplateVar.get('selectedAction') === 'deploy-contract' && !data)
                return GlobalNotification.warning({
                    content: 'i18n:wallet.contracts.error.noDataProvided',
                    duration: 2
                });


            if(selectedAccount.balance === '0')
                return GlobalNotification.warning({
                    content: 'i18n:wallet.send.error.emptyWallet',
                    duration: 2
                });


            if(!web3.isAddress(to) && !data)
                return GlobalNotification.warning({
                    content: 'i18n:wallet.send.error.noReceiver',
                    duration: 2
                });


            if(tokenAddress === 'expanse') {
                
                if((_.isEmpty(amount) || amount === '0' || !_.isFinite(amount)) && !data)
                    return GlobalNotification.warning({
                        content: 'i18n:wallet.send.error.noAmount',
                        duration: 2
                    });

                if(new BigNumber(amount, 10).gt(new BigNumber(selectedAccount.balance, 10)))
                    return GlobalNotification.warning({
                        content: 'i18n:wallet.send.error.notEnoughFunds',
                        duration: 2
                    });

            } else {

                var token = Tokens.findOne({address: tokenAddress}),
                    tokenBalance = token.balances[selectedAccount._id] || '0';

                if(new BigNumber(amount, 10).gt(new BigNumber(tokenBalance, 10)))
                    return GlobalNotification.warning({
                        content: 'i18n:wallet.send.error.notEnoughFunds',
                        duration: 2
                    });
            }
            


            // The function to send the transaction
            var sendTransaction = function(estimatedGas){

                // show loading
                // ExpElements.Modal.show('views_modals_loading');

                TemplateVar.set(template, 'sending', true);


                // use gas set in the input field
                estimatedGas = estimatedGas || Number($('.send-transaction-info input.gas').val());
                console.log('Finally choosen gas', estimatedGas);

                
                // EXPANSE TX
                if(tokenAddress === 'expanse') {
                    console.log('Send Expanse');

                    // CONTRACT TX
                    if(contracts['ct_'+ selectedAccount._id]) {

                        contracts['ct_'+ selectedAccount._id].execute.sendTransaction(to || '', amount || '', data || '', {
                            from: selectedAccount.owners[0],
                            gasPrice: gasPrice,
                            gas: estimatedGas
                        }, function(error, txHash){

                            TemplateVar.set(template, 'sending', false);

                            console.log(error, txHash);
                            if(!error) {
                                console.log('SEND from contract', amount);

                                data = (!to && contract)
                                    ? {contract: contract, data: data}
                                    : data;

                                addTransactionAfterSend(txHash, amount, selectedAccount.address, to, gasPrice, estimatedGas, data);

                                FlowRouter.go('dashboard');

                            } else {
                                // ExpElements.Modal.hide();

                                GlobalNotification.error({
                                    content: error.message,
                                    duration: 8
                                });
                            }
                        });
                    
                    // SIMPLE TX
                    } else {
                        
                        console.log('Gas Price: '+ gasPrice);
                        console.log('Amount:', amount);

                        web3.eth.sendTransaction({
                            from: selectedAccount.address,
                            to: to,
                            data: data,
                            value: amount,
                            gasPrice: gasPrice,
                            gas: estimatedGas
                        }, function(error, txHash){

                            TemplateVar.set(template, 'sending', false);

                            console.log(error, txHash);
                            if(!error) {
                                console.log('SEND simple');

                                data = (!to && contract)
                                    ? {contract: contract, data: data}
                                    : data;

                                addTransactionAfterSend(txHash, amount, selectedAccount.address, to, gasPrice, estimatedGas, data);

                                FlowRouter.go('dashboard');
                            } else {

                                // ExpElements.Modal.hide();

                                GlobalNotification.error({
                                    content: error.message,
                                    duration: 8
                                });
                            }
                        });
                         
                    }


                // TOKEN TRANSACTION
                } else {
                    console.log('Send Token');

                    var tokenInstance = TokenContract.at(tokenAddress);

                    // CONTRACT TX
                    if(contracts['ct_'+ selectedAccount._id]) {
                        var tokenSendData = tokenInstance.transfer.getData(to, amount, {
                            from: selectedAccount.address,
                            gasPrice: gasPrice,
                            gas: estimatedGas
                        });

                        contracts['ct_'+ selectedAccount._id].execute.sendTransaction(tokenAddress, '0', tokenSendData, {
                            from: selectedAccount.owners[0],
                            gasPrice: gasPrice,
                            gas: estimatedGas
                        }, function(error, txHash){

                            TemplateVar.set(template, 'sending', false);

                            console.log(error, txHash);
                            if(!error) {
                                console.log('SEND TOKEN from contract', amount, 'with data ', tokenSendData);

                                addTransactionAfterSend(txHash, amount, selectedAccount.address, to, gasPrice, estimatedGas, tokenSendData, token._id);

                                FlowRouter.go('dashboard');

                            } else {
                                // ExpElements.Modal.hide();

                                GlobalNotification.error({
                                    content: error.message,
                                    duration: 8
                                });
                            }
                        });

                    } else {

                        tokenInstance.transfer.sendTransaction(to, amount, {
                            from: selectedAccount.address,
                            gasPrice: gasPrice,
                            gas: estimatedGas
                        }, function(error, txHash){

                            TemplateVar.set(template, 'sending', false);

                            console.log(error, txHash);
                            if(!error) {
                                console.log('SEND TOKEN', amount);

                                addTransactionAfterSend(txHash, amount, selectedAccount.address, to, gasPrice, estimatedGas, null, token._id);

                                FlowRouter.go('dashboard');
                                // GlobalNotification.warning({
                                //     content: 'token sent',
                                //     duration: 2
                                // });

                            } else {

                                // ExpElements.Modal.hide();

                                GlobalNotification.error({
                                    content: error.message,
                                    duration: 8
                                });
                            }
                        });
                    }

                }
            };

            // SHOW CONFIRMATION WINDOW when NOT MIST
            if(typeof mist === 'undefined') {

                console.log('estimatedGas: ' + estimatedGas);
                
                ExpElements.Modal.question({
                    template: 'views_modals_sendTransactionInfo',
                    data: {
                        from: selectedAccount.address,
                        to: to,
                        amount: amount,
                        gasPrice: gasPrice,
                        estimatedGas: estimatedGas,
                        estimatedGasPlusAddition: sendAll ? estimatedGas : estimatedGas + 100000, // increase the provided gas by 100k
                        data: data
                    },
                    ok: sendTransaction,
                    cancel: true
                },{
                    class: 'send-transaction-info'
                });

            // LET MIST HANDLE the CONFIRMATION
            } else {
                sendTransaction(sendAll ? estimatedGas : estimatedGas + 100000);
            }
        }
    }
});


