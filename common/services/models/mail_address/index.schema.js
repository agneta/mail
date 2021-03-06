module.exports = {
  name: 'Mail_Address',
  base: 'PersistedModel',
  properties: {
    name: {
      type: 'string',
      required: false
    },
    email: {
      type: 'string',
      required: true
    }
  },
  validations: [],
  mixins: {},
  relations: {
    emails: {
      type: 'hasMany',
      model: 'Mail_Item',
      foreignKey: 'addressId',
      through: 'Mail_Item_Address'
    }
  },
  indexes: {
    search: {
      keys: {
        email: 'text'
      }
    },
    email: {
      keys: {
        email: 1
      },
      options: {
        unique: true
      }
    }
  },
  methods: {}
};
