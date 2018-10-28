module.exports = {
  name: 'Mail_Item',
  base: 'PersistedModel',
  properties: {
    from: {
      type: 'array'
    },
    to: {
      type: 'array'
    },
    cc: {
      type: 'array'
    },
    storageKey: {
      type: 'string'
    },
    html: {
      type: 'string',
      required: false
    },
    text: {
      type: 'string',
      required: false
    },
    subject: {
      type: 'string',
      required: false
    },
    attachments: {
      type: 'array'
    },
    date: {
      type: 'date'
    },
    status: {
      type: 'string',
      required: false
    },
    mailboxId: {
      type: 'objectid',
      required: false
    },
    mailAccountId: {
      type: 'objectid',
      required: false
    },
    messageId: {
      type: 'string',
      required: false
    }
  },
  indexes: {
    storageKey: {
      keys: {
        storageKey: 1
      },
      options: {
        unique: true,
        sparse: true
      }
    }
  },
  validations: [],
  mixins: {},
  relations: {
    addresses: {
      type: 'hasMany',
      model: 'Mail_Address',
      foreignKey: 'emailId',
      through: 'Mail_Item_Address'
    },
    mailAccount: {
      type: 'belongsTo',
      model: 'Mail_Account',
      foreignKey: 'mailAccountId'
    },
    mailbox: {
      type: 'belongsTo',
      model: 'Mail_Box',
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
