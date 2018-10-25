module.exports = {
  name: 'Mail_Box',
  base: 'PersistedModel',
  properties: {
    path: {
      type: 'string'
    },
    email: {
      type: 'string'
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
    relations: {
      items: {
        type: 'hasMany',
        model: 'Mail_Item',
        foreignKey: 'itemId',
        through: 'Mail_Item_Box'
      }
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
