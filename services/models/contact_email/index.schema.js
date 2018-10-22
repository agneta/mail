module.exports = {
  name: 'Contact_Email',
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
    type: {
      type: 'string',
      required: true
    },
    status: {
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
      model: 'Contact_Address',
      foreignKey: 'emailId',
      through: 'Contact_Email_Address'
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
