agneta.directive('AgEmailInbox', function(
  Mail_Box,
  $sce,
  $mdDialog,
  $location
) {
  var vm = this;
  var accounts = (vm.accounts = {});
  var email = (vm.email = {});

  accounts.load = function() {
    Mail_Box.inboxAccounts().$promise.then(function(result) {
      //console.log(result);
      accounts.list = result.list;
    });
  };

  accounts.loadEmails = function() {
    if (!accounts.selected) {
      return;
    }
    Mail_Box.inboxList({
      addressId: accounts.selected._id
    }).$promise.then(function(result) {
      if (!angular.equals(email.list, result.list)) {
        email.list = result.list;
      }
      //console.log(result);
    });
  };

  accounts.open = function(account) {
    accounts.selected = account;
    $location.search({
      account: account._id
    });
    accounts.loadEmails();
  };

  accounts.close = function() {
    accounts.selected = null;
    email.selected = null;
    email.list = null;
    accounts.load();
  };

  email.open = function(item) {
    email.selected = item;
    Mail_Box.inboxLoad({
      emailId: item.id
    }).$promise.then(function(result) {
      result.html = $sce.trustAsHtml(result.html);
      email.data = result;
    });
  };

  email.reply = function() {
    $mdDialog.open({
      partial: 'email-compose',
      data: {
        to: email.selected.from,
        cc: email.selected.cc,
        from: accounts.email
      }
    });
  };

  accounts.load();
});
