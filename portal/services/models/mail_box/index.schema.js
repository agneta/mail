module.exports = {
  acls: [
    {
      accessType: '*',
      principalType: 'ROLE',
      principalId: 'account_manager',
      permission: 'ALLOW'
    },
    {
      accessType: '*',
      principalType: 'ROLE',
      principalId: 'administrator',
      permission: 'ALLOW'
    }
  ]
};
