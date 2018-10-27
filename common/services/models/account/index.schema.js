module.exports = {
  relations: {
    mailAccounts: {
      type: 'hasMany',
      model: 'Mail_Account',
      foreignKey: 'accountId',
      through: 'Mail_Account_User'
    }
  }
};
