module.exports = {
  name: 'Mail_Item_Address',
  base: 'PersistedModel',
  properties: {
    type: {
      type: 'string'
    },
    date: {
      type: 'date'
    },
    emailId: {
      type: 'objectid',
      required: true
    },
    addressId: {
      type: 'objectid',
      required: true
    }
  },
  validations: [],
  relations: {
    email: {
      type: 'belongsTo',
      model: 'Mail_Item',
      foreignKey: 'emailId'
    },
    address: {
      type: 'belongsTo',
      model: 'Mail_Address',
      foreignKey: 'addressId'
    }
  },
  indexes: {
    email: {
      keys: {
        addressId: 1,
        emailId: 1,
        type: 1
      },
      options: {
        unique: true
      }
    }
  }
};
