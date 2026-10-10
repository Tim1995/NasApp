/* ============================================================
 * 小脚丫旅行记 · 家庭与账号
 * 角色：parent（爸爸妈妈，可编辑）/ child（宝宝，可浏览+留言）/ guest（访客，只读）
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var DB = BF.DB;

  var Auth = (BF.Auth = {});

  var FAMILY_KEY = 'family';
  var SESSION_KEY = 'session';

  Auth.family = null;
  Auth.current = null; // 当前登录成员对象

  function roleLabel(role) {
    return role === 'parent' ? '家长' : role === 'child' ? '宝宝' : '访客';
  }
  Auth.roleLabel = roleLabel;

  /* ------------------------- 加载 / 保存 ------------------------- */

  Auth.load = function () {
    return DB.kvGet(FAMILY_KEY).then(function (fam) {
      Auth.family = fam || null;
      return Auth.family;
    });
  };

  Auth.hasFamily = function () {
    return !!(Auth.family && Auth.family.members && Auth.family.members.length);
  };

  /* ============================================================
   * 登录模式
   *   open（默认）  —— 家庭内网自用，打开就能进，不拦人
   *   protected     —— 需要选择成员 / 输密码，建议暴露到外网时开启
   * ============================================================ */

  Auth.isOpenMode = function () {
    return !Auth.family || Auth.family.authMode !== 'protected';
  };

  Auth.setAuthMode = function (mode) {
    if (!Auth.family) return Promise.resolve();
    Auth.family.authMode = mode === 'protected' ? 'protected' : 'open';
    if (Auth.family.authMode === 'open' && !Auth.current) {
      Auth.autoLogin();
    }
    return Auth.saveFamily();
  };

  /** 免登录模式下的「当前是谁」：优先默认成员，其次第一位家长 */
  Auth.defaultMember = function () {
    if (!Auth.hasFamily()) return null;
    return Auth.findMember(Auth.family.defaultMemberId) || Auth.parents()[0] || Auth.members()[0] || null;
  };

  Auth.autoLogin = function () {
    var m = Auth.defaultMember();
    Auth.current = m;
    if (m) Auth.setSession(m.id);
    return Promise.resolve(m);
  };

  /** 切换当前使用者（不需要密码，仅用于标记「这条记录是谁加的」） */
  Auth.switchTo = function (memberId) {
    var m = Auth.findMember(memberId);
    if (!m) return Promise.reject(new Error('成员不存在'));
    Auth.current = m;
    Auth.family.defaultMemberId = m.id;
    return Auth.setSession(m.id).then(function () {
      return Auth.saveFamily();
    });
  };

  Auth.saveFamily = function () {
    Auth.family.updatedAt = Date.now();
    return DB.kvSet(FAMILY_KEY, Auth.family);
  };

  Auth.restoreSession = function () {
    return DB.kvGet(SESSION_KEY).then(function (s) {
      if (!s || !s.memberId || !Auth.family) return null;
      var m = Auth.findMember(s.memberId);
      Auth.current = m || null;
      return Auth.current;
    });
  };

  Auth.setSession = function (memberId) {
    return DB.kvSet(SESSION_KEY, { memberId: memberId, at: Date.now() });
  };

  Auth.logout = function () {
    Auth.current = null;
    return DB.kvDel(SESSION_KEY);
  };

  /* ------------------------- 成员操作 ------------------------- */

  Auth.findMember = function (id) {
    if (!Auth.family || !Auth.family.members) return null;
    for (var i = 0; i < Auth.family.members.length; i++) {
      if (Auth.family.members[i].id === id) return Auth.family.members[i];
    }
    return null;
  };

  Auth.members = function () {
    return (Auth.family && Auth.family.members) || [];
  };

  Auth.children = function () {
    return Auth.members().filter(function (m) {
      return m.role === 'child';
    });
  };

  Auth.parents = function () {
    return Auth.members().filter(function (m) {
      return m.role === 'parent';
    });
  };

  Auth.primaryChild = function () {
    var kids = Auth.children();
    if (!kids.length) return null;
    return kids.slice().sort(function (a, b) {
      return String(a.birthDate || '9999').localeCompare(String(b.birthDate || '9999'));
    })[0];
  };

  /** 创建成员（不含密码存储细节） */
  Auth.makeMember = function (data) {
    return {
      id: U.uid('m'),
      name: data.name || '家庭成员',
      role: data.role || 'parent',
      relation: data.relation || (data.role === 'child' ? '宝宝' : '家长'),
      username: (data.username || '').trim(),
      salt: '',
      hash: '',
      birthDate: data.birthDate || '',
      avatarId: data.avatarId || '',
      createdAt: Date.now()
    };
  };

  /** 设置成员密码 */
  Auth.setPassword = function (member, password) {
    if (!password) {
      member.salt = '';
      member.hash = '';
      return Promise.resolve(member);
    }
    member.salt = U.randomSalt();
    return U.hash(password, member.salt).then(function (h) {
      member.hash = h;
      return member;
    });
  };

  /** 校验密码 */
  Auth.checkPassword = function (member, password) {
    if (!member.hash) return Promise.resolve(true); // 未设密码，直接进入
    return U.hash(password || '', member.salt).then(function (h) {
      return h === member.hash;
    });
  };

  /* ------------------------- 初始化家庭 ------------------------- */

  /**
   * 首次创建家庭
   * data = { familyName, homeCity, motto, child:{name,birthDate,avatarId}, parents:[{name,relation,username,password}] }
   */
  Auth.createFamily = function (data) {
    var members = [];
    var kid = Auth.makeMember({
      name: data.child.name,
      role: 'child',
      relation: data.child.relation || '宝宝',
      birthDate: data.child.birthDate,
      avatarId: data.child.avatarId
    });
    members.push(kid);

    var parentList = (data.parents || []).filter(function (p) {
      return p && (p.name || '').trim();
    });

    var chain = Promise.resolve();
    parentList.forEach(function (p) {
      var m = Auth.makeMember({
        name: p.name,
        role: 'parent',
        relation: p.relation || '家长',
        username: p.username,
        avatarId: p.avatarId
      });
      chain = chain.then(function () {
        return Auth.setPassword(m, p.password).then(function () {
          members.push(m);
        });
      });
    });

    return chain.then(function () {
      // 常住城市如果能在内置库里找到，就顺手转成带坐标的家庭地址，
      // 这样「从家出发的实际驾车里程」立刻就能算；精度不够可以再去设置里细调。
      var homeCity = (data.homeCity || '').trim();
      var home = null;
      if (homeCity && BF.Places) {
        var homeHit = BF.Places.localSearch(homeCity, 1)[0];
        if (homeHit) {
          home = {
            name: homeCity,
            lat: homeHit.lat,
            lng: homeHit.lng,
            city: homeHit.city || homeCity,
            province: homeHit.prov || ''
          };
        }
      }

      Auth.family = {
        id: U.uid('fam'),
        name: data.familyName || (kid.name + '的家'),
        homeCity: homeCity,
        home: home,
        motto: data.motto || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        members: members
      };
      return Auth.saveFamily().then(function () {
        return kid;
      });
    });
  };

  /* ------------------------- 登录 ------------------------- */

  /** 无需密码的成员（宝宝/访客）快速进入 */
  Auth.quickLogin = function (memberId) {
    var m = Auth.findMember(memberId);
    if (!m) return Promise.reject(new Error('成员不存在'));
    Auth.current = m;
    return Auth.setSession(m.id).then(function () {
      return m;
    });
  };

  Auth.login = function (username, password) {
    var uname = (username || '').trim().toLowerCase();
    var found = Auth.members().filter(function (m) {
      return (m.username || '').toLowerCase() === uname;
    })[0];
    if (!found) return Promise.reject(new Error('没有找到这个账号，请检查是否输入正确'));
    return Auth.checkPassword(found, password).then(function (ok) {
      if (!ok) throw new Error('密码不正确，再试一次吧');
      Auth.current = found;
      return Auth.setSession(found.id).then(function () {
        return found;
      });
    });
  };

  /* ------------------------- 权限 ------------------------- */

  Auth.isParent = function () {
    return !!Auth.current && Auth.current.role === 'parent';
  };

  Auth.isChild = function () {
    return !!Auth.current && Auth.current.role === 'child';
  };

  /** 是否允许编辑内容（增删行程/照片） */
  Auth.canEdit = function () {
    return Auth.isParent();
  };

  /** 是否允许留言（宝宝可以写下回忆） */
  Auth.canComment = function () {
    return !!Auth.current && Auth.current.role !== 'guest';
  };

  /** 编辑保护：不满足时给出提示 */
  Auth.requireEdit = function () {
    if (Auth.canEdit()) return true;
    U.toast('只有爸爸妈妈可以修改旅行记录哦', 'error');
    return false;
  };

})(window);
