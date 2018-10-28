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
      required: true
    },
    mailAccountId: {
      type: 'objectid',
      required: true
    },
    messageId: {
      type: 'string',
      required: false
    },
    uid: {
      type: 'number',
      required: false
    }
  },
  indexes: {
    storageKey: {
      keys: {
        storageKey: 1
      },
      options: {
        unique: true
      }
    },
    uid: {
      keys: {
        uid: 1,
        mailboxId: 1
      },
      options: {
        unique: true
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
