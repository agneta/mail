module.exports = {
  name: 'Mail_Account_User',
  base: 'PersistedModel',
  properties: {
    accountId: {
      type: 'objectid',
      required: true
    },
    userId: {
      type: 'objectid',
      required: true
    }
  },
  validations: [],
  relations: {
    account: {
      type: 'belongsTo',
      model: 'Mail_Account',
      foreignKey: 'accountId'
    },
    user: {
      type: 'belongsTo',
      model: 'Account',
      foreignKey: 'userId'
    }
  },
  indexes: {
    unique: {
      keys: {
        userId: 1,
        accountId: 1
      },
      options: {
        unique: true
      }
    }
  }
};
