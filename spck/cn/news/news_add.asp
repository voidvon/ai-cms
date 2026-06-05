<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
<!--#include file="../../../inc/safe.asp"-->
<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../login.asp';</SCRIPT>" 
	response.end
end if
 
'权限限制^^^^^^^^^^^^^^^^^^^^
 dim ishavegant
 ishavegant=false
 in_str=split(request.Cookies("masterflag"),",")
 for each ins in in_str
 	if trim(ins)="04" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 	response.redirect "../../err.asp"
 		response.end
 end if

%>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">

<link rel="stylesheet" type="text/css" href="../../css/style.css">
</head>
<script LANGUAGE="JavaScript">
function check()
{
if (document.form.title.value=="")
{
alert("请输入文章标题！")
document.form.title.focus()
document.form.title.select()
return
}
if (document.form.typeid.value=="")
{
alert("请选择文章所属类别！")
document.form.typeid.focus()
document.form.typeid.select()
return
}
document.form.submit()
}
</script>
<script type="text/javascript"  src="../../ueditor/ueditor.config.js"></script>
<script type="text/javascript"  src="../../ueditor/ueditor.all.min.js"> </script>
<script type="text/javascript"  src="../../ueditor/lang/zh-cn/zh-cn.js"></script>
<table width="98%" border="0" cellspacing="0" cellpadding="0" align=center class="tableBorder"> 
  <tr> 
     <th height=25 colspan="2" class="tableHeaderText">新闻管理 </th> 
  </tr> 
  <tr> 
     <td colspan="2" class="forumRowHighlight"><p><B>注意</B>：<BR> 
         ①类别直接与发布的信息相关联，删除类别可能会影响到以前发布的信息。<BR>
		 <font color="red"><b>②如果选择了 首页推荐(图片) 和 首页头条 和 添加到图文列表 就一定要上传一张标题图片。</b></font><br> </td> 
  </tr> 
   
  <tr> 
    <td width="26%" height=25 class="forumRowHighlight">&nbsp;</td>
	 <td class="forumRowHighlight"><a href="News_index.asp">管理新闻</a> | <a href="News_add.asp">添加新闻</a> | <a href="Class.asp">管理类别</a> | <a href="Class_add.asp">添加类别</a> | [<a href="javascript:location.reload()">刷新页面</a>] </td> 
  </tr> 
</table> 
<form name="form" method="POST" action="News_save.asp?action=add"> 
<input type='hidden' name="picture" value = "">
  <TABLE width="100%" border="0" align=center cellpadding="0" cellspacing="1" class="tableBorder"> 
    <tr> 
      <th height=25 colspan="2" class="tableHeaderText">添加新闻</th> 
    </tr> 
    <TR ALIGN="center"> 
      <TD> <TABLE width="100%" border="0" cellpadding="5" cellspacing="2" bordercolorlight="#CEE7FF" bordercolordark="#CEE7FF" style="border-collapse: collapse"> 
          <TR> 
            <TD width="155" align="right" nowrap class="Forumrow"><b>文章标题：</b></TD> 
            <TD colspan="2" class="Forumrow"><font color="#F4FAFF"> 
              <select name='IncludePic'> 
                <option selected> </option> 
                <option value="[图文]">[图文]</option> 
                <option value="[组图]">[组图]</option> 
                <option value="[推荐]">[推荐]</option> 
                <option value="[注意]">[注意]</option> 
              </select> 
              <input name="title" type="text" class="smallInput" size="55" maxlength="100"> 
              </font> <font color='#FF0000'>*</font></TD>
          </TR>
		   <TR> 
            <TD align="right" valign="middle" class="Forumrow"><b>文章分类：</b></td> 
            <TD colspan="2" class="Forumrow"> <font color="#F4FAFF"> 
              <select name="typeid" size="1" class="lh17">
                <option >请选择所属类别</option>
			  <%
			  Sql="Select * from benming_ch_NewsCat where root=0"
			  Set Rs=Server.CreateObject("ADODB.RecordSet")
			  Rs.open Sql,Conn,1,1
			  do while not Rs.eof
			  	Response.Write("<option>==="&Rs("CatName")&"===</option>")
				Sql1="Select * from benming_ch_NewsCat where Root="&Rs("id")
				Set Rs1=Server.CreateObject("ADODB.RecordSet")
				Rs1.open Sql1,Conn,1,1
				do while not Rs1.eof
					Response.Write("<option value="&Rs1("id")&">&nbsp;&nbsp;"&Rs1("CatName")&"</option>")
					Rs1.movenext
				loop
				Rs1.close
				Set Rs1=nothing
			  	Rs.movenext
			  loop
			  Rs.close
			  Set Rs=nothing
			  %>
         	  </select> <a href="Class_add.asp"><font color='#FF0000'>添加</font></a></font> 
			  &nbsp;&nbsp;&nbsp;<input name="pic_on" type="checkbox" id="pic_on" value="1" onClick=showadv()>
<font color="red"><span id="advance">上传标题图片</span> </font></TD> 
          </TR>  		  		  		  		 
		  <TR id=adv style="DISPLAY: none">
		  	<td class="Forumrow"></td> 
				<TD colspan="2" class="Forumrow">
					
<!----------------------------------------------------文件上传----------------------------------------------->
  <iframe id="d_file" frameborder="0" src="../../../inc/upload.asp?tMode=2&istwo=0&utype=news" width="300" height="30" scrolling="no"></iframe>
  <!--------------------------------------------------------------------------->	  				
  							
				</TD>
			</TR>
          <TR> 
            <TD align="right" class="Forumrow"><b>文章属性： </b></TD> 
            <TD width="582" class="Forumrow">
			<!--
			<input name="tjnews" type="checkbox" id="tjnews" value="1"> 
              小类推荐&nbsp;&nbsp;&nbsp;&nbsp;
			  -->
              <input name="tjhome" type="checkbox" id="tjhome" value="1"> 
              首页推荐&nbsp;&nbsp;&nbsp;&nbsp;
            <!--<input name="homepic" type="checkbox" id="homepic" value="1" onClick=showadv1()> 
            首页推荐<font color="blue">(图片)</font>&nbsp;&nbsp;&nbsp;&nbsp;
            <input name="homehot" type="checkbox" id="homehot" value="1" onClick=showadv2()> 
            首页头条<font color="blue">(必需图片)</font>&nbsp;&nbsp; -->			  </TD> 
            <TD width="161" class="Forumrow"  id=advpic style="display:none; ">
			<!--
			<input name="pictext" type="checkbox" id="pictext"  value="1">
<span style="color:red;">添加到图文列表</span>--></TD>
          </TR>

		  <TR>
		    <TD align="right" class="Forumrow"><b>关键字：</B></td>
		    <TD colspan="2" valign="middle" class="Forumrow"><input name="key" type="text" id="key" size="100"></TD>
	      </TR>
		  <TR> 
            <TD align="right" class="Forumrow"><b>简单描述：</b></td> 
            <TD colspan="2" valign="middle" class="Forumrow"><textarea name="desc" cols="100" rows="5" id="desc"></textarea></TD> 
          </TR> 
          <TR> 
            <TD align="right" class="Forumrow"><b>详细信息：</b></TD> 
            <TD colspan="2" class="Forumrow">
			
			   <textarea name="content" id="myEditor" style="width:720px; height:300px"></textarea>
<script type="text/javascript">
    UE.getEditor('myEditor')
</script>
			</TD> 
          </TR> 
          <TR height="40"> 
            <TD colspan="3" align="center" class="Forumrow" height="40">
              <input type="button" name="Submit" value=" 提　交 保 存" class="smallInput" onClick="check()">
			  &nbsp;&nbsp;&nbsp; 
            <input type="reset" name="Submit2" value=" 重　新 添 写" class="smallInput">          </TR> 
      </TABLE></TD> 
    </TR> 
  </TABLE> 
  <Br/>
</FORM> 
<script>
function showadv(){
if (document.form.pic_on.checked == true) {
		adv.style.display = "";
		advance.innerText="取消上传标题图片"
		advpic.style.display = "";
	}else{
		adv.style.display = "none";
		advpic.style.display = "none";
		advance.innerText="上传标题图片"
	}
}		
</script> 
<script>
function showadv1(){
if (document.form.homepic.checked == true) {
		adv.style.display = "";
		
	}else{
		adv.style.display = "none";
		
	}
}		
</script>
<script>
function showadv2(){
if (document.form.homehot.checked == true) {
		adv.style.display = "";
	}else{
		adv.style.display = "none";
	}
}		
</script>
