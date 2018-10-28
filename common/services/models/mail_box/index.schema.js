module.exports = {
  name: 'Mail_Box',
  base: 'PersistedModel',
  properties: {
    path: {
      required: true,
      type: 'string'
    },
    mailAccountId: {
      required: true,
      type: 'objectId'
    },
    uidNext: {
      required: true,
      type: 'number',
      default: 0
    },
    modifyIndex: {
      required: true,
      type: 'number',
      default: 0
    }
  },
  indexes: {
    unique: {
      keys: {
        path: 1,
        mailAccountId: 1
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
      foreignKey: 'mailAccountId'
    },
    items: {
      type: 'hasMany',
      model: 'Mail_Item',
      foreignKey: 'mailboxId'
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
