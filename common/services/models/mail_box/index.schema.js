module.exports = {
  name: 'Mail_Box',
  base: 'PersistedModel',
  properties: {
    path: {
      required: true,
      type: 'string'
    },
    accountId: {
      required: true,
      type: 'objectId'
    }
  },
  indexes: {
    unique: {
      keys: {
        path: 1,
        accountId: 1
      },
      options: {
        unique: true
      }
    }
  },
  validations: [],
  mixins: {},
  relations: {
    account: {
      type: 'belongsTo',
      model: 'Mail_Account',
      foreignKey: 'accountId'
    },
    items: {
      type: 'hasMany',
      model: 'Mail_Item',
      foreignKey: 'itemId',
      through: 'Mail_Item_Box'
    }
  },
  acls: [
    {
      accessType: '*',
      principalType: 'ROLE',
      principalId: '$everyone',
      permission: 'DENY'
    },
    {
      accessType: '*',
      principalType: 'ROLE',
      principalId: 'account_manager',
      permission: 'ALLOW'
    }
  ],
  methods: {}
};
